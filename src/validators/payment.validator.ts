import { z } from 'zod';

export const createRazorpayOrderSchema = z.preprocess((val: any) => {
  if (!val || typeof val !== 'object') return val;
  const cloned = { ...val };
  if (cloned.amount !== undefined && cloned.amount !== null) {
    cloned.amount = Number(cloned.amount);
  }
  if (cloned.order_id && !cloned.orderId) {
    cloned.orderId = cloned.order_id;
  }
  return cloned;
}, z.object({
  amount: z
    .number({
      invalid_type_error: 'Amount must be a numeric value in paise',
    })
    .min(100, 'Amount must be at least 100 paise (₹1)')
    .optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .default('INR')
    .optional(),
  receipt: z
    .string()
    .max(40, 'Receipt identifier cannot exceed 40 characters')
    .optional(),
  notes: z.record(z.any()).optional(),
  orderId: z.string().optional(),
}).refine((data) => data.amount !== undefined || data.orderId !== undefined, {
  message: 'Either amount (in paise, >= 100) or orderId must be provided',
  path: ['amount'],
}));

export const verifyRazorpayPaymentSchema = z.preprocess((val: any) => {
  if (!val || typeof val !== 'object') return val;
  const cloned = { ...val };
  if (!cloned.razorpay_order_id) {
    cloned.razorpay_order_id = cloned.order_id || cloned.orderId;
  }
  if (!cloned.razorpay_payment_id) {
    cloned.razorpay_payment_id = cloned.payment_id || cloned.paymentId;
  }
  if (!cloned.razorpay_signature) {
    cloned.razorpay_signature = cloned.signature;
  }
  if (!cloned.orderId && cloned.internal_order_id) {
    cloned.orderId = cloned.internal_order_id;
  }
  return cloned;
}, z.object({
  razorpay_order_id: z
    .string({ required_error: 'razorpay_order_id is required' })
    .min(1, 'razorpay_order_id cannot be empty'),
  razorpay_payment_id: z
    .string({ required_error: 'razorpay_payment_id is required' })
    .min(1, 'razorpay_payment_id cannot be empty'),
  razorpay_signature: z
    .string({ required_error: 'razorpay_signature is required' })
    .min(1, 'razorpay_signature cannot be empty'),
  orderId: z.string().optional(),
}));

export type CreateRazorpayOrderInput = z.infer<typeof createRazorpayOrderSchema>;
export type VerifyRazorpayPaymentInput = z.infer<typeof verifyRazorpayPaymentSchema>;
