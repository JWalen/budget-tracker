import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware, requireWriteAccess, TenantRequest } from '../middleware/tenant';
import { LoggerClass } from '../services/logger';

const router = Router();
const logger = new LoggerClass('BudgetTemplates');

router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * @swagger
 * /budget-templates:
 *   get:
 *     summary: Get all budget templates
 *     tags: [Budget Templates]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', async (req: TenantRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { type } = req.query;

    let sql = `
      SELECT bt.*, 
             CASE WHEN ubt.id IS NOT NULL THEN true ELSE false END as is_saved,
             ubt.last_used
      FROM budget_templates bt
      LEFT JOIN user_budget_templates ubt ON bt.id = ubt.template_id AND ubt.user_id = $1
      WHERE bt.is_public = true OR bt.created_by = $1
    `;
    const params: any[] = [userId];

    if (type) {
      sql += ' AND bt.type = $2';
      params.push(type);
    }

    sql += ' ORDER BY bt.is_public DESC, bt.name ASC';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Get templates error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /budget-templates/{id}:
 *   get:
 *     summary: Get template details
 *     tags: [Budget Templates]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', async (req: TenantRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id, 10);
    const userId = req.userId!;

    const result = await query(
      `SELECT bt.*, 
              CASE WHEN ubt.id IS NOT NULL THEN true ELSE false END as is_saved,
              ubt.customizations, ubt.last_used
       FROM budget_templates bt
       LEFT JOIN user_budget_templates ubt ON bt.id = ubt.template_id AND ubt.user_id = $2
       WHERE bt.id = $1 AND (bt.is_public = true OR bt.created_by = $2)`,
      [templateId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get template error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /budget-templates:
 *   post:
 *     summary: Create custom template
 *     tags: [Budget Templates]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', requireWriteAccess, async (req: TenantRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { name, description, type, rules, categories } = req.body;

    if (!name || !type || !categories) {
      return res.status(400).json({ error: 'Name, type, and categories are required' });
    }

    const result = await query(
      `INSERT INTO budget_templates 
       (name, description, type, is_public, created_by, rules, categories)
       VALUES ($1, $2, $3, false, $4, $5, $6)
       RETURNING *`,
      [name, description, type, userId, JSON.stringify(rules || {}), JSON.stringify(categories)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Create template error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /budget-templates/{id}/apply:
 *   post:
 *     summary: Apply template to create budgets
 *     tags: [Budget Templates]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/apply', requireWriteAccess, async (req: TenantRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id, 10);
    const userId = req.userId!;
    const organizationId = req.organizationId!;
    const { month, year, income } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    // Get template
    const templateResult = await query(
      'SELECT * FROM budget_templates WHERE id = $1',
      [templateId]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = templateResult.rows[0];
    const categories = template.categories;

    // Get user's categories
    const userCategoriesResult = await query(
      'SELECT * FROM categories WHERE organization_id = $1 AND type = $2',
      [organizationId, 'expense']
    );

    const userCategories = userCategoriesResult.rows;
    const budgetsCreated: any[] = [];

    // Apply template based on type
    if (template.type === '50-30-20') {
      // Calculate amounts based on income
      if (!income) {
        return res.status(400).json({ error: 'Income is required for 50/30/20 template' });
      }

      for (const category of categories) {
        const amount = (parseFloat(income) * category.percentage) / 100;
        
        // Find matching user category
        const userCategory = userCategories.find((c) =>
          c.name.toLowerCase().includes(category.name.toLowerCase())
        );

        if (userCategory) {
          // Create or update budget
          const budgetResult = await query(
            `INSERT INTO budgets (user_id, organization_id, category_id, amount_limit, month, year)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id, category_id, month, year)
             DO UPDATE SET amount_limit = $4
             RETURNING *`,
            [userId, organizationId, userCategory.id, amount, month, year]
          );

          budgetsCreated.push(budgetResult.rows[0]);
        }
      }
    } else if (template.type === 'zero-based' || template.type === 'custom') {
      // Calculate based on percentages
      if (!income) {
        return res.status(400).json({ error: 'Income is required' });
      }

      for (const category of categories) {
        if (category.is_income) continue;

        const amount = (parseFloat(income) * (category.percentage || 0)) / 100;
        
        const userCategory = userCategories.find((c) =>
          c.name.toLowerCase().includes(category.name.toLowerCase())
        );

        if (userCategory) {
          const budgetResult = await query(
            `INSERT INTO budgets (user_id, organization_id, category_id, amount_limit, month, year)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id, category_id, month, year)
             DO UPDATE SET amount_limit = $4
             RETURNING *`,
            [userId, organizationId, userCategory.id, amount, month, year]
          );

          budgetsCreated.push(budgetResult.rows[0]);
        }
      }
    } else if (template.type === 'envelope') {
      // Use fixed amounts
      for (const category of categories) {
        const userCategory = userCategories.find((c) =>
          c.name.toLowerCase().includes(category.name.toLowerCase())
        );

        if (userCategory && category.amount) {
          const budgetResult = await query(
            `INSERT INTO budgets (user_id, organization_id, category_id, amount_limit, month, year)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id, category_id, month, year)
             DO UPDATE SET amount_limit = $4
             RETURNING *`,
            [userId, organizationId, userCategory.id, category.amount, month, year]
          );

          budgetsCreated.push(budgetResult.rows[0]);
        }
      }
    }

    // Update last used
    await query(
      `INSERT INTO user_budget_templates (user_id, organization_id, template_id, last_used)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, template_id, organization_id)
       DO UPDATE SET last_used = NOW()`,
      [userId, organizationId, templateId]
    );

    res.json({
      message: `Created ${budgetsCreated.length} budgets from template`,
      budgets: budgetsCreated,
    });
  } catch (error) {
    logger.error('Apply template error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /budget-templates/{id}/save:
 *   post:
 *     summary: Save template to user's favorites
 *     tags: [Budget Templates]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/save', async (req: TenantRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id, 10);
    const userId = req.userId!;
    const organizationId = req.organizationId!;

    await query(
      `INSERT INTO user_budget_templates (user_id, organization_id, template_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, template_id, organization_id) DO NOTHING`,
      [userId, organizationId, templateId]
    );

    res.json({ message: 'Template saved' });
  } catch (error) {
    logger.error('Save template error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /budget-templates/{id}/unsave:
 *   delete:
 *     summary: Remove template from favorites
 *     tags: [Budget Templates]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id/unsave', async (req: TenantRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id, 10);
    const userId = req.userId!;
    const organizationId = req.organizationId!;

    await query(
      'DELETE FROM user_budget_templates WHERE user_id = $1 AND organization_id = $2 AND template_id = $3',
      [userId, organizationId, templateId]
    );

    res.json({ message: 'Template removed' });
  } catch (error) {
    logger.error('Unsave template error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /budget-templates/{id}:
 *   put:
 *     summary: Update custom template
 *     tags: [Budget Templates]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', requireWriteAccess, async (req: TenantRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id, 10);
    const userId = req.userId!;
    const { name, description, rules, categories } = req.body;

    // Verify ownership
    const checkResult = await query(
      'SELECT id FROM budget_templates WHERE id = $1 AND created_by = $2',
      [templateId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(403).json({ error: 'Cannot edit this template' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(description);
      paramIndex++;
    }

    if (rules) {
      updates.push(`rules = $${paramIndex}`);
      values.push(JSON.stringify(rules));
      paramIndex++;
    }

    if (categories) {
      updates.push(`categories = $${paramIndex}`);
      values.push(JSON.stringify(categories));
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(templateId);

    const result = await query(
      `UPDATE budget_templates SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update template error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /budget-templates/{id}:
 *   delete:
 *     summary: Delete custom template
 *     tags: [Budget Templates]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', requireWriteAccess, async (req: TenantRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id, 10);
    const userId = req.userId!;

    // Verify ownership and not public
    const checkResult = await query(
      'SELECT id FROM budget_templates WHERE id = $1 AND created_by = $2 AND is_public = false',
      [templateId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(403).json({ error: 'Cannot delete this template' });
    }

    await query('DELETE FROM budget_templates WHERE id = $1', [templateId]);

    res.json({ message: 'Template deleted' });
  } catch (error) {
    logger.error('Delete template error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
