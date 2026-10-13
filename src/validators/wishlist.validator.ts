import { z } from 'zod';

export const addToWishlistSchema = z.object({
  productId: z
    .string({ required_error: 'Product ID is required' })
    .uuid('Invalid Product ID format'),
});

export const mergeWishlistSchema = z.object({
  guestId: z.string().uuid('Invalid Guest ID format').optional(),
});
