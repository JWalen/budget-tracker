import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { LoggerClass } from './logger';

const logger = new LoggerClass('Storage');

let s3Client: S3Client | null = null;
let useLocalStorage = true;
const LOCAL_UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// Initialize S3 client if credentials are available
export const initStorage = () => {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (accessKeyId && secretAccessKey) {
    try {
      s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      useLocalStorage = false;
      logger.info('S3 storage initialized');
    } catch (error) {
      logger.error('Failed to initialize S3', error as Error);
      useLocalStorage = true;
    }
  } else {
    logger.info('Using local file storage (AWS credentials not configured)');
    useLocalStorage = true;
  }

  // Ensure local upload directory exists
  if (useLocalStorage) {
    fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true }).catch((error) => {
      logger.error('Failed to create upload directory', error as Error);
    });
  }
};

interface UploadResult {
  filename: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  thumbnailPath?: string;
  s3Key?: string;
  s3Bucket?: string;
}

/**
 * Upload file to S3 or local storage
 */
export const uploadFile = async (
  file: Express.Multer.File,
  userId: number,
  organizationId: number
): Promise<UploadResult> => {
  try {
    const fileExt = path.extname(file.originalname);
    const filename = `${crypto.randomBytes(16).toString('hex')}${fileExt}`;
    const userFolder = `user-${userId}/org-${organizationId}`;
    
    if (useLocalStorage) {
      // Local storage
      const uploadPath = path.join(LOCAL_UPLOAD_DIR, userFolder);
      await fs.mkdir(uploadPath, { recursive: true });
      
      const filePath = path.join(uploadPath, filename);
      await fs.writeFile(filePath, file.buffer);

      // Generate thumbnail for images
      let thumbnailPath: string | undefined;
      if (file.mimetype.startsWith('image/')) {
        const thumbFilename = `thumb_${filename}`;
        thumbnailPath = path.join(uploadPath, thumbFilename);
        await sharp(file.buffer)
          .resize(200, 200, { fit: 'inside' })
          .toFile(thumbnailPath);
      }

      return {
        filename,
        filePath: path.join(userFolder, filename),
        fileSize: file.size,
        mimeType: file.mimetype,
        thumbnailPath: thumbnailPath ? path.join(userFolder, `thumb_${filename}`) : undefined,
      };
    } else {
      // S3 storage
      const bucket = process.env.AWS_S3_BUCKET || 'budget-tracker-receipts';
      const s3Key = `${userFolder}/${filename}`;

      const upload = new Upload({
        client: s3Client!,
        params: {
          Bucket: bucket,
          Key: s3Key,
          Body: file.buffer,
          ContentType: file.mimetype,
          Metadata: {
            userId: userId.toString(),
            organizationId: organizationId.toString(),
            originalFilename: file.originalname,
          },
        },
      });

      await upload.done();

      // Generate and upload thumbnail for images
      let thumbnailPath: string | undefined;
      if (file.mimetype.startsWith('image/')) {
        const thumbBuffer = await sharp(file.buffer)
          .resize(200, 200, { fit: 'inside' })
          .toBuffer();

        const thumbKey = `${userFolder}/thumb_${filename}`;
        
        await s3Client!.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: thumbKey,
            Body: thumbBuffer,
            ContentType: file.mimetype,
          })
        );

        thumbnailPath = thumbKey;
      }

      return {
        filename,
        filePath: s3Key,
        fileSize: file.size,
        mimeType: file.mimetype,
        thumbnailPath,
        s3Key,
        s3Bucket: bucket,
      };
    }
  } catch (error) {
    logger.error('File upload failed', error as Error);
    throw new Error('File upload failed');
  }
};

/**
 * Delete file from S3 or local storage
 */
export const deleteFile = async (filePath: string, thumbnailPath?: string, s3Key?: string, s3Bucket?: string) => {
  try {
    if (useLocalStorage) {
      // Delete from local storage
      const fullPath = path.join(LOCAL_UPLOAD_DIR, filePath);
      await fs.unlink(fullPath).catch(() => {});
      
      if (thumbnailPath) {
        const thumbPath = path.join(LOCAL_UPLOAD_DIR, thumbnailPath);
        await fs.unlink(thumbPath).catch(() => {});
      }
    } else if (s3Client && s3Key && s3Bucket) {
      // Delete from S3
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: s3Bucket,
          Key: s3Key,
        })
      );

      if (thumbnailPath) {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: s3Bucket,
            Key: thumbnailPath,
          })
        );
      }
    }
  } catch (error) {
    logger.error('File deletion failed', error as Error);
  }
};

/**
 * Get signed URL for S3 file or local file path
 */
export const getFileUrl = async (
  filePath: string,
  s3Key?: string,
  s3Bucket?: string,
  expiresIn: number = 3600
): Promise<string> => {
  if (useLocalStorage) {
    // Return local file path (served via Express static middleware)
    return `/uploads/${filePath}`;
  } else if (s3Client && s3Key && s3Bucket) {
    // Generate signed URL for S3
    const command = new GetObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  }

  throw new Error('Unable to generate file URL');
};

/**
 * Get file from local storage
 */
export const getLocalFile = async (filePath: string): Promise<Buffer> => {
  const fullPath = path.join(LOCAL_UPLOAD_DIR, filePath);
  return await fs.readFile(fullPath);
};

export const isUsingLocalStorage = () => useLocalStorage;
export const getLocalUploadDir = () => LOCAL_UPLOAD_DIR;
