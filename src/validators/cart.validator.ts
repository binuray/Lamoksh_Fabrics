import { z } from 'zod';

export const addToCartSchema = z.object({
  productId: z
    .string({ required_error: 'Product ID is required' })
    .uuid('Invalid Product ID format'),
  variantId: z
    .string()
    .uuid('Invalid Variant ID format')
    .optional(),
  quantity: z
    .number({ required_error: 'Quantity is required' })
    .int('Quantity must be an integer')
    .min(1, 'Quantity must be greater than 0'),
});

export const updateCartItemSchema = z.object({
  quantity: z
    .number({ required_error: 'Quantity is required' })
    .int('Quantity must be an integer')
    .min(1, 'Quantity must be greater than 0'),
});

export const mergeCartSchema = z.object({
  guestId: z.string().uuid('Invalid Guest ID format').optional(),
});
