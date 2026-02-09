import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { query } from '../config/database';
import { stripeService } from '../services/stripe';
import { LoggerClass } from '../services/logger';

const router = Router();
const logger = new LoggerClass('StripeWebhooks');

/**
 * @swagger
 * /webhooks/stripe:
 *   post:
 *     summary: Handle Stripe webhook events
 *     tags: [Webhooks]
 *     description: Receives and processes Stripe webhook events for subscription lifecycle
 */
router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error('Stripe webhook secret not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripeService.constructWebhookEvent(
      req.body,
      sig,
      webhookSecret
    ) as Stripe.Event;

    if (!event) {
      logger.error('Webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }
  } catch (err) {
    logger.error('Webhook error', err as Error);
    return res.status(400).json({ error: 'Webhook error' });
  }

  // Log webhook event
  try {
    await query(
      'INSERT INTO stripe_webhooks (event_id, event_type, payload, processed) VALUES ($1, $2, $3, false)',
      [event.id, event.type, JSON.stringify(event)]
    );
  } catch (error) {
    logger.error('Failed to log webhook event', error as Error);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;

      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    // Mark webhook as processed
    await query(
      'UPDATE stripe_webhooks SET processed = true WHERE event_id = $1',
      [event.id]
    );

    res.json({ received: true });
  } catch (error) {
    logger.error('Error processing webhook', error as Error);
    
    // Log the error in the webhook table
    await query(
      'UPDATE stripe_webhooks SET error = $1 WHERE event_id = $2',
      [(error as Error).message, event.id]
    );

    res.status(500).json({ error: 'Processing failed' });
  }
});

// Subscription created
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  logger.info('Subscription created', { subscriptionId: subscription.id });

  const customerId = subscription.customer as string;
  
  // Get user by Stripe customer ID
  const userResult = await query(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (userResult.rows.length === 0) {
    throw new Error(`User not found for customer ${customerId}`);
  }

  const userId = userResult.rows[0].id;
  const priceId = subscription.items.data[0].price.id;

  // Get plan by price ID
  const planResult = await query(
    'SELECT id FROM subscription_plans WHERE stripe_price_id_monthly = $1 OR stripe_price_id_yearly = $1',
    [priceId]
  );

  if (planResult.rows.length === 0) {
    throw new Error(`Plan not found for price ${priceId}`);
  }

  const planId = planResult.rows[0].id;

  // Create subscription record
  await query(
    `INSERT INTO subscriptions 
     (user_id, plan_id, stripe_customer_id, stripe_subscription_id, status, 
      billing_cycle, current_period_start, current_period_end, trial_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      userId,
      planId,
      customerId,
      subscription.id,
      subscription.status,
      subscription.items.data[0].price.recurring?.interval || 'monthly',
      new Date((subscription.current_period_start as number) * 1000),
      new Date((subscription.current_period_end as number) * 1000),
      subscription.trial_end ? new Date((subscription.trial_end as number) * 1000) : null,
    ]
  );

  logger.info('Subscription created in database', { userId, planId });
}

// Subscription updated
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  logger.info('Subscription updated', { subscriptionId: subscription.id });

  await query(
    `UPDATE subscriptions 
     SET status = $1, 
         current_period_start = $2,
         current_period_end = $3,
         cancel_at_period_end = $4,
         updated_at = NOW()
     WHERE stripe_subscription_id = $5`,
    [
      subscription.status,
      new Date((subscription.current_period_start as number) * 1000),
      new Date((subscription.current_period_end as number) * 1000),
      subscription.cancel_at_period_end,
      subscription.id,
    ]
  );

  logger.info('Subscription updated in database');
}

// Subscription deleted (canceled)
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  logger.info('Subscription deleted', { subscriptionId: subscription.id });

  // Update subscription status to canceled
  await query(
    `UPDATE subscriptions 
     SET status = 'canceled',
         canceled_at = NOW(),
         updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscription.id]
  );

  // Move user back to free plan
  const subResult = await query(
    'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1',
    [subscription.id]
  );

  if (subResult.rows.length > 0) {
    const userId = subResult.rows[0].user_id;
    const freePlanResult = await query(
      "SELECT id FROM subscription_plans WHERE name = 'free'"
    );

    if (freePlanResult.rows.length > 0) {
      // Create new free subscription
      await query(
        `INSERT INTO subscriptions (user_id, plan_id, status)
         VALUES ($1, $2, 'active')`,
        [userId, freePlanResult.rows[0].id]
      );
    }
  }

  logger.info('User moved to free plan');
}

// Payment succeeded
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  logger.info('Payment succeeded', { invoiceId: invoice.id });

  const customerId = invoice.customer as string;
  const subscriptionId = invoice.subscription as string;

  // Get user and subscription
  const userResult = await query(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (userResult.rows.length === 0) {
    throw new Error(`User not found for customer ${customerId}`);
  }

  const userId = userResult.rows[0].id;

  const subResult = await query(
    'SELECT id FROM subscriptions WHERE stripe_subscription_id = $1',
    [subscriptionId]
  );

  // Record payment
  await query(
    `INSERT INTO payments 
     (user_id, subscription_id, stripe_payment_intent_id, amount, currency, status, payment_method, receipt_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      userId,
      subResult.rows.length > 0 ? subResult.rows[0].id : null,
      invoice.payment_intent as string,
      invoice.amount_paid / 100, // Convert cents to dollars
      invoice.currency.toUpperCase(),
      'succeeded',
      'card',
      invoice.hosted_invoice_url,
    ]
  );

  logger.info('Payment recorded in database');
}

// Payment failed
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  logger.error('Payment failed', { invoiceId: invoice.id });

  const customerId = invoice.customer as string;
  const subscriptionId = invoice.subscription as string;

  // Update subscription status to past_due
  await query(
    `UPDATE subscriptions 
     SET status = 'past_due', updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscriptionId]
  );

  // Get user for notification
  const userResult = await query(
    'SELECT id, email FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (userResult.rows.length > 0) {
    const user = userResult.rows[0];
    logger.info('Payment failed - user should be notified', { userId: user.id, email: user.email });
    // TODO: Send email notification
  }
}

// Trial will end
async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  logger.info('Trial will end', { subscriptionId: subscription.id });

  const customerId = subscription.customer as string;

  // Get user for notification
  const userResult = await query(
    'SELECT id, email FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (userResult.rows.length > 0) {
    const user = userResult.rows[0];
    const trialEndDate = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
    
    logger.info('Trial ending soon - user should be notified', { 
      userId: user.id, 
      email: user.email,
      trialEnd: trialEndDate 
    });
    // TODO: Send email notification
  }
}

export default router;
