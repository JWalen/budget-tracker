import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { stripeService, initStripe } from '../services/stripe';
import { LoggerClass } from '../services/logger';

const router = Router();
const logger = new LoggerClass('Subscriptions');

// Initialize Stripe
initStripe();

router.use(authMiddleware);

/**
 * @swagger
 * /subscriptions/plans:
 *   get:
 *     summary: Get all subscription plans
 *     tags: [Subscriptions]
 *     responses:
 *       200:
 *         description: List of available subscription plans
 */
router.get('/plans', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM subscription_plans WHERE is_active = true ORDER BY price_monthly ASC'
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Get plans error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /subscriptions/current:
 *   get:
 *     summary: Get current user subscription
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 */
router.get('/current', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    
    const result = await query(
      `SELECT s.*, sp.name as plan_name, sp.display_name, sp.features, sp.limits
       FROM subscriptions s
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE s.user_id = $1 AND s.status = 'active'
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      // Return free plan if no subscription
      const freePlan = await query(
        "SELECT * FROM subscription_plans WHERE name = 'free'"
      );
      return res.json({ plan: freePlan.rows[0], subscription: null });
    }

    res.json({ plan: result.rows[0], subscription: result.rows[0] });
  } catch (error) {
    logger.error('Get current subscription error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /subscriptions/create-checkout:
 *   post:
 *     summary: Create Stripe checkout session
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 */
router.post('/create-checkout', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { planId, billingCycle } = req.body; // 'monthly' or 'yearly'

    // Get user and plan info
    const [userResult, planResult] = await Promise.all([
      query('SELECT * FROM users WHERE id = $1', [userId]),
      query('SELECT * FROM subscription_plans WHERE id = $1', [planId]),
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const user = userResult.rows[0];
    const plan = planResult.rows[0];

    // Get or create Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripeService.createCustomer(user.email, user.name, {
        user_id: userId.toString(),
      });
      
      if (!customer) {
        return res.status(500).json({ error: 'Failed to create customer' });
      }

      customerId = customer.id;
      await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, userId]);
    }

    // Get the appropriate price ID
    const priceId = billingCycle === 'yearly' ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
    
    if (!priceId) {
      return res.status(400).json({ error: 'Price not configured for this plan' });
    }

    // Create checkout session
    const checkoutUrl = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      `${process.env.FRONTEND_URL}/subscription/success`,
      `${process.env.FRONTEND_URL}/subscription/canceled`
    );

    if (!checkoutUrl) {
      return res.status(500).json({ error: 'Failed to create checkout session' });
    }

    res.json({ url: checkoutUrl });
  } catch (error) {
    logger.error('Create checkout error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /subscriptions/portal:
 *   post:
 *     summary: Create billing portal session
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 */
router.post('/portal', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const userResult = await query('SELECT stripe_customer_id FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0 || !userResult.rows[0].stripe_customer_id) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    const portalUrl = await stripeService.createPortalSession(
      userResult.rows[0].stripe_customer_id,
      `${process.env.FRONTEND_URL}/settings/billing`
    );

    if (!portalUrl) {
      return res.status(500).json({ error: 'Failed to create portal session' });
    }

    res.json({ url: portalUrl });
  } catch (error) {
    logger.error('Create portal error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /subscriptions/cancel:
 *   post:
 *     summary: Cancel subscription
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 */
router.post('/cancel', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { immediately } = req.body; // Cancel now vs. at period end

    const subResult = await query(
      'SELECT * FROM subscriptions WHERE user_id = $1 AND status = $2',
      [userId, 'active']
    );

    if (subResult.rows.length === 0) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const subscription = subResult.rows[0];
    
    const canceled = await stripeService.cancelSubscription(
      subscription.stripe_subscription_id,
      immediately
    );

    if (!canceled) {
      return res.status(500).json({ error: 'Failed to cancel subscription' });
    }

    // Update database
    await query(
      'UPDATE subscriptions SET cancel_at_period_end = $1, canceled_at = NOW(), updated_at = NOW() WHERE id = $2',
      [!immediately, subscription.id]
    );

    res.json({ message: 'Subscription canceled successfully' });
  } catch (error) {
    logger.error('Cancel subscription error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /subscriptions/usage:
 *   get:
 *     summary: Get current usage statistics
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 */
router.get('/usage', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const result = await query(
      'SELECT resource_type, count FROM usage_tracking WHERE user_id = $1 AND period_start = $2',
      [userId, periodStart]
    );

    const usage: Record<string, number> = {};
    result.rows.forEach((row) => {
      usage[row.resource_type] = row.count;
    });

    res.json({ usage, period: { start: periodStart, end: periodEnd } });
  } catch (error) {
    logger.error('Get usage error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
