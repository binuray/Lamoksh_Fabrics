import crypto from 'crypto';
import argon2 from 'argon2';

export function generate6DigitOtp(): string {
  const otpNumber = crypto.randomInt(100000, 1000000);
  return otpNumber.toString();
}

export async function hashOtp(otp: string): Promise<string> {
  return argon2.hash(otp, {
    type: argon2.argon2id,
  });
}

export async function verifyOtp(hash: string, plainOtp: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainOtp);
  } catch (error) {
    return false;
  }
}
