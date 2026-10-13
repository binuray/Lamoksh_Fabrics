import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform((val) => parseInt(val, 10)).default('5000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('1h'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  OTP_EXPIRES_IN_MINUTES: z.string().transform((val) => parseInt(val, 10)).default('10'),
  MAX_LOGIN_ATTEMPTS: z.string().transform((val) => parseInt(val, 10)).default('5'),
  ACCOUNT_LOCK_MINUTES: z.string().transform((val) => parseInt(val, 10)).default('60'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform((val) => (val ? parseInt(val, 10) : 587)).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('no-reply@lamkosh.com'),
  CLIENT_URL: z.string().default('http://localhost:3000'),
  ALLOWED_ORIGINS: z.string().optional(),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_UPLOAD_DIR: z.string().default('uploads'),
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  ORDER_NOTIFICATION_EMAIL: z.string().optional(),
  SHIPROCKET_EMAIL: z.string().optional(),
  SHIPROCKET_PASSWORD: z.string().optional(),
  SHIPROCKET_BASE_URL: z.string().default('https://apiv2.shiprocket.in/v1/external'),
  SHIPROCKET_PICKUP_LOCATION: z.string().default('Primary'),
  SHIPROCKET_DEFAULT_WEIGHT: z.string().transform((val) => (val ? parseFloat(val) : 0.5)).default('0.5'),
  SHIPROCKET_DEFAULT_LENGTH: z.string().transform((val) => (val ? parseFloat(val) : 10)).default('10'),
  SHIPROCKET_DEFAULT_BREADTH: z.string().transform((val) => (val ? parseFloat(val) : 10)).default('10'),
  SHIPROCKET_DEFAULT_HEIGHT: z.string().transform((val) => (val ? parseFloat(val) : 10)).default('10'),
  SHIPROCKET_AUTO_CREATE_ORDER: z.string().transform((val) => val === 'true' || val === '1').default('false'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('Invalid environment variables:', JSON.stringify(_env.error.format(), null, 2));
  throw new Error('Invalid environment variables');
}

export const env = _env.data;
