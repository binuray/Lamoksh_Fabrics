import { z } from 'zod';

const indianMobileRegex = /^(?:\+91|91)?[6-9]\d{9}$/;

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .refine((val) => /[A-Z]/.test(val), { message: 'Password must contain at least one uppercase letter' })
  .refine((val) => /[a-z]/.test(val), { message: 'Password must contain at least one lowercase letter' })
  .refine((val) => /[0-9]/.test(val), { message: 'Password must contain at least one number' })
  .refine((val) => /[^A-Za-z0-9]/.test(val), { message: 'Password must contain at least one special character' });

export function normalizeMobile(mobile: string): string {
  const cleaned = mobile.replace(/\D/g, '');
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return cleaned.slice(2);
  }
  return cleaned;
}

export const superAdminSignupSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters'),
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  mobile: z
    .string({ required_error: 'Mobile number is required' })
    .trim()
    .refine((val) => indianMobileRegex.test(val), { message: 'Invalid Indian mobile number' })
    .transform(normalizeMobile),
  password: passwordSchema,
});

export const userSignupSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters'),
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  mobile: z
    .string({ required_error: 'Mobile number is required' })
    .trim()
    .refine((val) => indianMobileRegex.test(val), { message: 'Invalid Indian mobile number' })
    .transform(normalizeMobile),
  password: passwordSchema,
});

export const loginSchema = z.object({
  identifier: z
    .string({ required_error: 'Email or mobile is required' })
    .trim()
    .min(1, 'Identifier is required'),
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  identifier: z
    .string({ required_error: 'Email or mobile is required' })
    .trim()
    .min(1, 'Identifier is required'),
});

export const resetPasswordSchema = z.object({
  identifier: z
    .string({ required_error: 'Email or mobile is required' })
    .trim()
    .min(1, 'Identifier is required'),
  otp: z
    .string({ required_error: 'OTP is required' })
    .length(6, 'OTP must be 6 digits')
    .regex(/^\d+$/, 'OTP must contain only numbers'),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  oldPassword: z.string({ required_error: 'Old password is required' }),
  newPassword: passwordSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().optional(), // Can also come from cookie
});
