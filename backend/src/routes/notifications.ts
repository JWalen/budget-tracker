import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { tenantMiddleware, TenantRequest } from '../middleware/tenant';
import { sendNotificationToUser, sendNotificationToOrganization } from '../services/websocket';
import { LoggerClass } from '../services/logger';

const router = Router();
const logger = new LoggerClass('Notifications');

router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get user notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', async (req: TenantRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { limit = 50, offset = 0, unreadOnly = false } = req.query;

    let sql = 'SELECT * FROM notifications WHERE user_id = $1';
    const params: any[] = [userId];

    if (unreadOnly === 'true') {
      sql += ' AND is_read = false';
    }

    sql += ' ORDER BY created_at DESC LIMIT $2 OFFSET $3';
    params.push(limit, offset);

    const result = await query(sql, params);

    // Get unread count
    const countResult = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    res.json({
      notifications: result.rows,
      unreadCount: parseInt(countResult.rows[0].count, 10),
      total: result.rows.length,
    });
  } catch (error) {
    logger.error('Get notifications error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /notifications/{id}/read:
 *   post:
 *     summary: Mark notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/read', async (req: TenantRequest, res: Response) => {
  try {
    const notificationId = parseInt(req.params.id, 10);
    const userId = req.userId!;

    await query(
      'UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2',
      [notificationId, userId]
    );

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    logger.error('Mark as read error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /notifications/read-all:
 *   post:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.post('/read-all', async (req: TenantRequest, res: Response) => {
  try {
    const userId = req.userId!;

    await query(
      'UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('Mark all as read error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /notifications/{id}:
 *   delete:
 *     summary: Delete notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', async (req: TenantRequest, res: Response) => {
  try {
    const notificationId = parseInt(req.params.id, 10);
    const userId = req.userId!;

    await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [notificationId, userId]);

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    logger.error('Delete notification error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /notifications/preferences:
 *   get:
 *     summary: Get notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get('/preferences', async (req: TenantRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const result = await query(
      `INSERT INTO notification_preferences (user_id) VALUES ($1) 
       ON CONFLICT (user_id) DO UPDATE SET user_id = $1 
       RETURNING *`,
      [userId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get preferences error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /notifications/preferences:
 *   put:
 *     summary: Update notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.put('/preferences', async (req: TenantRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const {
      emailEnabled,
      pushEnabled,
      budgetAlerts,
      transactionAlerts,
      collaborationAlerts,
      weeklySummary,
    } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (emailEnabled !== undefined) {
      updates.push(`email_enabled = $${paramIndex}`);
      values.push(emailEnabled);
      paramIndex++;
    }

    if (pushEnabled !== undefined) {
      updates.push(`push_enabled = $${paramIndex}`);
      values.push(pushEnabled);
      paramIndex++;
    }

    if (budgetAlerts !== undefined) {
      updates.push(`budget_alerts = $${paramIndex}`);
      values.push(budgetAlerts);
      paramIndex++;
    }

    if (transactionAlerts !== undefined) {
      updates.push(`transaction_alerts = $${paramIndex}`);
      values.push(transactionAlerts);
      paramIndex++;
    }

    if (collaborationAlerts !== undefined) {
      updates.push(`collaboration_alerts = $${paramIndex}`);
      values.push(collaborationAlerts);
      paramIndex++;
    }

    if (weeklySummary !== undefined) {
      updates.push(`weekly_summary = $${paramIndex}`);
      values.push(weeklySummary);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(userId);

    await query(
      `UPDATE notification_preferences SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`,
      values
    );

    res.json({ message: 'Preferences updated' });
  } catch (error) {
    logger.error('Update preferences error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /notifications/test:
 *   post:
 *     summary: Send test notification (development only)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.post('/test', async (req: TenantRequest, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  try {
    const userId = req.userId!;

    await sendNotificationToUser(userId, {
      type: 'test',
      title: 'Test Notification',
      message: 'This is a test notification from the system',
      data: { timestamp: new Date().toISOString() },
    });

    res.json({ message: 'Test notification sent' });
  } catch (error) {
    logger.error('Send test notification error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
