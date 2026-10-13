import { z } from 'zod';
import { normalizeMobile } from './auth.validator';

const indianMobileRegex = /^(?:\+91|91)?[6-9]\d{9}$/;

export const createAdminSchema = z.object({
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
  role: z
    .literal('ADMIN', {
      errorMap: () => ({ message: 'Only ADMIN role can be assigned' }),
    })
    .default('ADMIN'),
});

export const updateAdminSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().email().toLowerCase().trim().optional(),
  mobile: z
    .string()
    .trim()
    .refine((val) => indianMobileRegex.test(val), { message: 'Invalid Indian mobile number' })
    .transform(normalizeMobile)
    .optional(),
  isActive: z.boolean().optional(),
});

export const updatePermissionsSchema = z.object({
  permissions: z
    .array(z.string(), { required_error: 'Permissions array is required' })
    .min(0),
});
