import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { LoggerClass } from './logger';

const logger = new LoggerClass('Storage');

// sharp is a native module and only used for optional receipt thumbnails. Load it
// lazily and tolerate its absence (e.g. a platform without the prebuilt binary)
// so an upload never fails just because thumbnailing is unavailable.
let sharpModule: any | null | undefined;
function getSharp(): any | null {
  if (sharpModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      sharpModule = require('sharp');
    } catch (e) {
      sharpModule = null;
      logger.warn('sharp unavailable — receipt thumbnails disabled', { error: (e as Error).message });
    }
  }
  return sharpModule;
}

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

// Maximum allowed upload size (defense-in-depth; multer also enforces its own limit)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface DetectedType {
  ext: string;
  mime: string;
}

/**
 * Detect the true file type from magic bytes.
 * Only JPEG, PNG, GIF, WEBP images and PDFs are accepted. Trusting the
 * client-supplied mimetype/extension enables stored-XSS (e.g. an HTML file
 * renamed to .png), so validation is done against the actual content.
 */
export const detectFileType = (buffer: Buffer): DetectedType | null => {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: '.jpg', mime: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 &&
    buffer[2] === 0x4e && buffer[3] === 0x47
  ) {
    return { ext: '.png', mime: 'image/png' };
  }

  // PDF: 25 50 44 46 ('%PDF')
  if (
    buffer[0] === 0x25 && buffer[1] === 0x50 &&
    buffer[2] === 0x44 && buffer[3] === 0x46
  ) {
    return { ext: '.pdf', mime: 'application/pdf' };
  }

  // GIF: 'GIF8'
  if (
    buffer[0] === 0x47 && buffer[1] === 0x49 &&
    buffer[2] === 0x46 && buffer[3] === 0x38
  ) {
    return { ext: '.gif', mime: 'image/gif' };
  }

  // WEBP: 'RIFF' .... 'WEBP'
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 &&
    buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 &&
    buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { ext: '.webp', mime: 'image/webp' };
  }

  return null;
};

/**
 * Upload file to S3 or local storage
 */
export const uploadFile = async (
  file: Express.Multer.File,
  userId: number,
  organizationId: number
): Promise<UploadResult> => {
  try {
    // Enforce size cap (defense-in-depth alongside multer limits)
    if (file.size > MAX_FILE_SIZE || file.buffer.length > MAX_FILE_SIZE) {
      throw new Error('File exceeds maximum allowed size');
    }

    // Validate real content type via magic bytes and derive the stored
    // extension/mime from the DETECTED type — never trust originalname/mimetype.
    const detected = detectFileType(file.buffer);
    if (!detected) {
      throw new Error('Invalid file type. Only JPEG, PNG, GIF, WEBP images and PDFs are allowed.');
    }

    const fileExt = detected.ext;
    const mimeType = detected.mime;
    const filename = `${crypto.randomBytes(16).toString('hex')}${fileExt}`;
    const userFolder = `user-${userId}/org-${organizationId}`;

    if (useLocalStorage) {
      // Local storage
      const uploadPath = path.join(LOCAL_UPLOAD_DIR, userFolder);
      await fs.mkdir(uploadPath, { recursive: true });

      const filePath = path.join(uploadPath, filename);
      await fs.writeFile(filePath, file.buffer);

      // Generate thumbnail for images (best-effort — skip if sharp is unavailable).
      let thumbnailPath: string | undefined;
      const sharp = getSharp();
      if (sharp && mimeType.startsWith('image/')) {
        try {
          const thumbFilename = `thumb_${filename}`;
          const thumbFull = path.join(uploadPath, thumbFilename);
          await sharp(file.buffer).resize(200, 200, { fit: 'inside' }).toFile(thumbFull);
          thumbnailPath = thumbFull;
        } catch (e) {
          logger.warn('Thumbnail generation failed; storing receipt without one', { error: (e as Error).message });
        }
      }

      return {
        filename,
        filePath: path.join(userFolder, filename),
        fileSize: file.size,
        mimeType,
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
          ContentType: mimeType,
          Metadata: {
            userId: userId.toString(),
            organizationId: organizationId.toString(),
            originalFilename: file.originalname,
          },
        },
      });

      await upload.done();

      // Generate and upload thumbnail for images (best-effort).
      let thumbnailPath: string | undefined;
      const sharp = getSharp();
      if (sharp && mimeType.startsWith('image/')) {
        try {
          const thumbBuffer = await sharp(file.buffer).resize(200, 200, { fit: 'inside' }).toBuffer();
          const thumbKey = `${userFolder}/thumb_${filename}`;
          await s3Client!.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: thumbKey,
              Body: thumbBuffer,
              ContentType: mimeType,
            })
          );
          thumbnailPath = thumbKey;
        } catch (e) {
          logger.warn('S3 thumbnail generation failed; storing receipt without one', { error: (e as Error).message });
        }
      }

      return {
        filename,
        filePath: s3Key,
        fileSize: file.size,
        mimeType,
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
