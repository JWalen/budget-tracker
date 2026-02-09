import Stripe from 'stripe';
import { LoggerClass } from './logger';

const logger = new LoggerClass('Stripe');

let stripe: Stripe | null = null;

export const initStripe = (): Stripe | null => {
  const apiKey = process.env.STRIPE_SECRET_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('Stripe API key not configured in production!');
    } else {
      logger.info('Stripe not configured (optional in development)');
    }
    return null;
  }

  try {
    stripe = new Stripe(apiKey, {
      apiVersion: '2026-01-28.clover' as any,
      typescript: true,
    });

    logger.info('Stripe initialized successfully');
    return stripe;
  } catch (error) {
    logger.error('Failed to initialize Stripe', error as Error);
    return null;
  }
};

// Subscription management functions
export const stripeService = {
  // Create customer
  async createCustomer(email: string, name: string, metadata?: Record<string, string>): Promise<Stripe.Customer | null> {
    if (!stripe) return null;

    try {
      const customer = await stripe.customers.create({
        email,
        name,
        metadata,
      });
      return customer;
    } catch (error) {
      logger.error('Failed to create Stripe customer', error as Error);
      return null;
    }
  },

  // Create subscription
  async createSubscription(
    customerId: string,
    priceId: string,
    trialDays?: number
  ): Promise<Stripe.Subscription | null> {
    if (!stripe) return null;

    try {
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        trial_period_days: trialDays,
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
      });
      return subscription;
    } catch (error) {
      logger.error('Failed to create subscription', error as Error);
      return null;
    }
  },

  // Cancel subscription
  async cancelSubscription(subscriptionId: string, immediately: boolean = false): Promise<Stripe.Subscription | null> {
    if (!stripe) return null;

    try {
      if (immediately) {
        return await stripe.subscriptions.cancel(subscriptionId);
      } else {
        return await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
      }
    } catch (error) {
      logger.error('Failed to cancel subscription', error as Error);
      return null;
    }
  },

  // Update subscription
  async updateSubscription(subscriptionId: string, newPriceId: string): Promise<Stripe.Subscription | null> {
    if (!stripe) return null;

    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return await stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newPriceId,
          },
        ],
        proration_behavior: 'create_prorations',
      });
    } catch (error) {
      logger.error('Failed to update subscription', error as Error);
      return null;
    }
  },

  // Create billing portal session
  async createPortalSession(customerId: string, returnUrl: string): Promise<string | null> {
    if (!stripe) return null;

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return session.url;
    } catch (error) {
      logger.error('Failed to create portal session', error as Error);
      return null;
    }
  },

  // Create checkout session
  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<string | null> {
    if (!stripe) return null;

    try {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      return session.url;
    } catch (error) {
      logger.error('Failed to create checkout session', error as Error);
      return null;
    }
  },

  // Retrieve subscription
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
    if (!stripe) return null;

    try {
      return await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      logger.error('Failed to retrieve subscription', error as Error);
      return null;
    }
  },

  // List customer subscriptions
  async listCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    if (!stripe) return [];

    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 10,
      });
      return subscriptions.data;
    } catch (error) {
      logger.error('Failed to list subscriptions', error as Error);
      return [];
    }
  },

  // Verify webhook signature
  constructWebhookEvent(payload: string | Buffer, signature: string, secret: string): Stripe.Event | null {
    if (!stripe) return null;

    try {
      return stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (error) {
      logger.error('Webhook signature verification failed', error as Error);
      return null;
    }
  },
};

export const getStripe = (): Stripe | null => stripe;

export default stripe;
