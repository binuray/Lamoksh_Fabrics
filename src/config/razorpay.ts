import Razorpay from 'razorpay';
import { env } from './env';
import { AppError } from '../middleware/error.middleware';

let razorpayInstance: Razorpay | null = null;

export function getRazorpayKeyId(): string {
  const keyId = env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID;
  if (!keyId) {
    throw new AppError('Razorpay key id is not configured.', 500);
  }
  return keyId;
}

export function getRazorpayKeySecret(): string {
  const keySecret = env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    throw new AppError('Razorpay key secret is not configured.', 500);
  }
  return keySecret;
}

export function getRazorpayInstance(): Razorpay {
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();

  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  return razorpayInstance;
}
