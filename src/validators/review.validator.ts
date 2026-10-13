import { z } from 'zod';

export const createReviewSchema = z.object({
  productId: z.string().uuid('Valid product ID is required').optional(),
  orderId: z.string().uuid('Valid order ID is required'),
  rating: z
    .number({
      required_error: 'Rating is required',
      invalid_type_error: 'Rating must be a number',
    })
    .int('Rating must be an integer')
    .min(1, 'Rating must be between 1 and 5')
    .max(5, 'Rating must be between 1 and 5'),
  comment: z
    .string({
      required_error: 'Review comment is required',
      invalid_type_error: 'Review comment must be a string',
    })
    .trim()
    .min(1, 'Review comment cannot be empty')
    .max(2000, 'Review comment cannot exceed 2000 characters'),
});

export const updateReviewSchema = z.object({
  rating: z
    .number({
      invalid_type_error: 'Rating must be a number',
    })
    .int('Rating must be an integer')
    .min(1, 'Rating must be between 1 and 5')
    .max(5, 'Rating must be between 1 and 5')
    .optional(),
  comment: z
    .string({
      invalid_type_error: 'Review comment must be a string',
    })
    .trim()
    .min(1, 'Review comment cannot be empty')
    .max(2000, 'Review comment cannot exceed 2000 characters')
    .optional(),
});

export const moderateReviewSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED'], {
    errorMap: () => ({ message: 'Status must be PENDING, APPROVED, or REJECTED' }),
  }),
  adminFeedback: z.string().trim().max(1000, 'Admin feedback cannot exceed 1000 characters').optional(),
});

export const rejectReviewSchema = z.object({
  adminFeedback: z.string().trim().max(1000, 'Admin feedback cannot exceed 1000 characters').optional(),
});
