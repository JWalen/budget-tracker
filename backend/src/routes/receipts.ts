import { Router, Response } from 'express';
import multer from 'multer';
import { query } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware, requireWriteAccess, TenantRequest } from '../middleware/tenant';
import { uploadFile, deleteFile, getFileUrl, getLocalFile, isUsingLocalStorage } from '../services/storage';
import { LoggerClass } from '../services/logger';

const router = Router();
const logger = new LoggerClass('Receipts');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and PDFs
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and PDFs are allowed.'));
    }
  },
});

router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * @swagger
 * /receipts:
 *   get:
 *     summary: Get all receipts
 *     tags: [Receipts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', async (req: TenantRequest, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const { startDate, endDate, merchant, minAmount, maxAmount } = req.query;

    let sql = `
      SELECT r.*, c.name as category_name, c.color as category_color,
             t.description as transaction_description
      FROM receipts r
      LEFT JOIN categories c ON r.category_id = c.id
      LEFT JOIN transactions t ON r.transaction_id = t.id
      WHERE r.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (startDate) {
      sql += ` AND r.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      sql += ` AND r.date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (merchant) {
      sql += ` AND r.merchant ILIKE $${paramIndex}`;
      params.push(`%${merchant}%`);
      paramIndex++;
    }

    if (minAmount) {
      sql += ` AND r.amount >= $${paramIndex}`;
      params.push(minAmount);
      paramIndex++;
    }

    if (maxAmount) {
      sql += ` AND r.amount <= $${paramIndex}`;
      params.push(maxAmount);
      paramIndex++;
    }

    sql += ' ORDER BY r.created_at DESC';

    const result = await query(sql, params);

    // Generate URLs for receipts
    const receiptsWithUrls = await Promise.all(
      result.rows.map(async (receipt) => {
        let fileUrl: string | undefined;
        let thumbnailUrl: string | undefined;

        try {
          fileUrl = await getFileUrl(receipt.file_path, receipt.s3_key, receipt.s3_bucket);
          if (receipt.thumbnail_path) {
            thumbnailUrl = await getFileUrl(receipt.thumbnail_path, receipt.thumbnail_path, receipt.s3_bucket);
          }
        } catch (error) {
          logger.error('Failed to generate file URL', error as Error);
        }

        return {
          ...receipt,
          fileUrl,
          thumbnailUrl,
        };
      })
    );

    res.json(receiptsWithUrls);
  } catch (error) {
    logger.error('Get receipts error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /receipts/upload:
 *   post:
 *     summary: Upload a receipt
 *     tags: [Receipts]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/upload',
  requireWriteAccess,
  upload.single('receipt'),
  async (req: TenantRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const userId = req.userId!;
      const organizationId = req.organizationId!;
      const { transactionId, amount, merchant, date, categoryId } = req.body;

      // Upload file
      const uploadResult = await uploadFile(req.file, userId, organizationId);

      // Save receipt metadata to database
      const result = await query(
        `INSERT INTO receipts 
         (user_id, organization_id, transaction_id, filename, original_filename, 
          file_path, file_size, mime_type, thumbnail_path, s3_key, s3_bucket,
          amount, merchant, date, category_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          userId,
          organizationId,
          transactionId || null,
          uploadResult.filename,
          req.file.originalname,
          uploadResult.filePath,
          uploadResult.fileSize,
          uploadResult.mimeType,
          uploadResult.thumbnailPath || null,
          uploadResult.s3Key || null,
          uploadResult.s3Bucket || null,
          amount || null,
          merchant || null,
          date || null,
          categoryId || null,
        ]
      );

      const receipt = result.rows[0];

      // Generate file URLs
      const fileUrl = await getFileUrl(receipt.file_path, receipt.s3_key, receipt.s3_bucket);
      const thumbnailUrl = receipt.thumbnail_path
        ? await getFileUrl(receipt.thumbnail_path, receipt.thumbnail_path, receipt.s3_bucket)
        : undefined;

      res.status(201).json({
        ...receipt,
        fileUrl,
        thumbnailUrl,
      });
    } catch (error) {
      logger.error('Upload receipt error', error as Error);
      // Content validation failures (bad magic bytes / oversized) are client errors
      const message = (error as Error).message || '';
      if (/invalid file type|maximum allowed size/i.test(message)) {
        return res.status(400).json({ error: message });
      }
      res.status(500).json({ error: 'Upload failed' });
    }
  }
);

/**
 * @swagger
 * /receipts/{id}:
 *   patch:
 *     summary: Update receipt metadata
 *     tags: [Receipts]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id', requireWriteAccess, async (req: TenantRequest, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id, 10);
    const organizationId = req.organizationId!;
    const { transactionId, amount, merchant, date, categoryId } = req.body;

    // Verify receipt belongs to organization
    const checkResult = await query(
      'SELECT id FROM receipts WHERE id = $1 AND organization_id = $2',
      [receiptId, organizationId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (transactionId !== undefined) {
      updates.push(`transaction_id = $${paramIndex}`);
      values.push(transactionId);
      paramIndex++;
    }

    if (amount !== undefined) {
      updates.push(`amount = $${paramIndex}`);
      values.push(amount);
      paramIndex++;
    }

    if (merchant !== undefined) {
      updates.push(`merchant = $${paramIndex}`);
      values.push(merchant);
      paramIndex++;
    }

    if (date !== undefined) {
      updates.push(`date = $${paramIndex}`);
      values.push(date);
      paramIndex++;
    }

    if (categoryId !== undefined) {
      updates.push(`category_id = $${paramIndex}`);
      values.push(categoryId);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(receiptId);

    const result = await query(
      `UPDATE receipts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update receipt error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /receipts/{id}:
 *   delete:
 *     summary: Delete a receipt
 *     tags: [Receipts]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', requireWriteAccess, async (req: TenantRequest, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id, 10);
    const organizationId = req.organizationId!;

    // Get receipt info
    const result = await query(
      'SELECT * FROM receipts WHERE id = $1 AND organization_id = $2',
      [receiptId, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const receipt = result.rows[0];

    // Delete file
    await deleteFile(receipt.file_path, receipt.thumbnail_path, receipt.s3_key, receipt.s3_bucket);

    // Delete from database
    await query('DELETE FROM receipts WHERE id = $1', [receiptId]);

    res.json({ message: 'Receipt deleted' });
  } catch (error) {
    logger.error('Delete receipt error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /receipts/{id}/tags:
 *   post:
 *     summary: Add tag to receipt
 *     tags: [Receipts]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/tags', requireWriteAccess, async (req: TenantRequest, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id, 10);
    const organizationId = req.organizationId!;
    const { tag } = req.body;

    if (!tag) {
      return res.status(400).json({ error: 'Tag is required' });
    }

    // Verify receipt belongs to organization (prevents cross-tenant tag writes / IDOR)
    const checkResult = await query(
      'SELECT id FROM receipts WHERE id = $1 AND organization_id = $2',
      [receiptId, organizationId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    await query(
      'INSERT INTO receipt_tags (receipt_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [receiptId, tag]
    );

    res.status(201).json({ message: 'Tag added' });
  } catch (error) {
    logger.error('Add tag error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /receipts/{id}/tags/{tag}:
 *   delete:
 *     summary: Remove tag from receipt
 *     tags: [Receipts]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id/tags/:tag', requireWriteAccess, async (req: TenantRequest, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id, 10);
    const organizationId = req.organizationId!;
    const { tag } = req.params;

    // Verify receipt belongs to organization (prevents cross-tenant tag writes / IDOR)
    const checkResult = await query(
      'SELECT id FROM receipts WHERE id = $1 AND organization_id = $2',
      [receiptId, organizationId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    await query('DELETE FROM receipt_tags WHERE receipt_id = $1 AND tag = $2', [receiptId, tag]);

    res.json({ message: 'Tag removed' });
  } catch (error) {
    logger.error('Remove tag error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /:id/file — Authenticated, ownership-checked receipt file download.
// Replaces the previous unauthenticated /uploads static mount.
router.get('/:id/file', async (req: TenantRequest, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id, 10);
    if (!Number.isInteger(receiptId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const result = await query(
      'SELECT file_path, mime_type, original_filename, s3_key, s3_bucket FROM receipts WHERE id = $1 AND organization_id = $2',
      [receiptId, req.organizationId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Receipt not found' });
    }
    const receipt = result.rows[0];

    // For S3-backed storage, hand back a short-lived signed URL.
    if (receipt.s3_key) {
      const url = await getFileUrl(receipt.file_path, receipt.s3_key, receipt.s3_bucket);
      return res.json({ url });
    }

    const buffer = await getLocalFile(receipt.file_path);
    res.setHeader('Content-Type', receipt.mime_type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${(receipt.original_filename || 'receipt').replace(/[^\w.\-]/g, '_')}"`
    );
    res.send(buffer);
  } catch (error) {
    logger.error('Receipt file download error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
