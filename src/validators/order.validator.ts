import { z } from 'zod';

const mobileRegex = /^[6-9]\d{9}$/;
const pincodeRegex = /^\d{6}$/;

export const checkoutSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name cannot exceed 100 characters'),
  mobileNumber: z
    .string({ required_error: 'Mobile number is required' })
    .trim()
    .regex(mobileRegex, 'Invalid Indian mobile number format. Must be 10 digits starting with 6-9'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Invalid email address format'),
  address: z
    .string({ required_error: 'Address is required' })
    .trim()
    .min(5, 'Address must be at least 5 characters long')
    .max(500, 'Address cannot exceed 500 characters'),
  homeTown: z
    .string({ required_error: 'Home town is required' })
    .trim()
    .min(2, 'Home town must be at least 2 characters long')
    .max(100, 'Home town cannot exceed 100 characters'),
  city: z
    .string({ required_error: 'City is required' })
    .trim()
    .min(2, 'City must be at least 2 characters long')
    .max(100, 'City cannot exceed 100 characters'),
  state: z
    .string({ required_error: 'State is required' })
    .trim()
    .min(2, 'State must be at least 2 characters long')
    .max(100, 'State cannot exceed 100 characters'),
  pincode: z
    .string({ required_error: 'Pincode is required' })
    .trim()
    .regex(pincodeRegex, 'Invalid Indian PIN code format. Must be exactly 6 digits'),
});

export const updateOrderStatusSchema = z
  .object({
    status: z
      .enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'], {
        errorMap: () => ({ message: 'Invalid order status value' }),
      })
      .optional(),
    paymentStatus: z
      .enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED'], {
        errorMap: () => ({ message: 'Invalid payment status value' }),
      })
      .optional(),
  })
  .refine((data) => data.status !== undefined || data.paymentStatus !== undefined, {
    message: 'At least one of status or paymentStatus must be provided',
  });
