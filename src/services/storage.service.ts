import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface StorageFileResult {
  url: string;
  key: string;
}

export interface StorageProvider {
  uploadFile(file: Express.Multer.File, subfolder: 'images' | 'videos'): Promise<StorageFileResult>;
  deleteFile(key: string): Promise<void>;
  getFileUrl(key: string): string;
}

export class LocalStorageService implements StorageProvider {
  private uploadDir: string;

  constructor() {
    this.uploadDir = path.resolve(process.cwd(), env.LOCAL_UPLOAD_DIR);
  }

  async uploadFile(file: Express.Multer.File, subfolder: 'images' | 'videos'): Promise<StorageFileResult> {
    const folderPath = path.join(this.uploadDir, 'products', subfolder);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Sanitize extension and filename
    const originalExt = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const ext = originalExt || (subfolder === 'images' ? '.webp' : '.mp4');
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;

    // Prevent path traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(folderPath, safeFilename);

    await fs.promises.writeFile(filePath, file.buffer);

    const relativeKey = `products/${subfolder}/${safeFilename}`;
    const url = `/uploads/${relativeKey}`;

    logger.info({ key: relativeKey, url }, 'File uploaded to Local Storage');
    return { url, key: relativeKey };
  }

  async deleteFile(key: string): Promise<void> {
    try {
      // Prevent path traversal in deletion key
      const normalizedKey = path.normalize(key).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(this.uploadDir, normalizedKey);

      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        logger.info({ key }, 'File deleted from Local Storage');
      }
    } catch (error) {
      logger.error({ error, key }, 'Failed to delete file from Local Storage');
    }
  }

  getFileUrl(key: string): string {
    return `/uploads/${key}`;
  }
}

export class S3StorageService implements StorageProvider {
  private s3Client: S3Client;
  private bucket: string;
  private region: string;

  constructor() {
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_S3_BUCKET) {
      throw new Error(
        'AWS S3 Configuration Error: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET are required in production mode.'
      );
    }

    this.region = env.AWS_REGION || 'us-east-1';
    this.bucket = env.AWS_S3_BUCKET;

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async uploadFile(file: Express.Multer.File, subfolder: 'images' | 'videos'): Promise<StorageFileResult> {
    const originalExt = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const ext = originalExt || (subfolder === 'images' ? '.webp' : '.mp4');
    const key = `products/${subfolder}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3Client.send(command);

    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    logger.info({ key, url }, 'File uploaded to AWS S3 Storage');

    return { url, key };
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      logger.info({ key }, 'File deleted from AWS S3 Storage');
    } catch (error) {
      logger.error({ error, key }, 'Failed to delete file from AWS S3 Storage');
    }
  }

  getFileUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}

let storageProviderInstance: StorageProvider | null = null;

export function getStorageService(): StorageProvider {
  if (!storageProviderInstance) {
    if (env.NODE_ENV === 'production' || env.STORAGE_DRIVER === 's3') {
      storageProviderInstance = new S3StorageService();
    } else {
      storageProviderInstance = new LocalStorageService();
    }
  }
  return storageProviderInstance;
}
