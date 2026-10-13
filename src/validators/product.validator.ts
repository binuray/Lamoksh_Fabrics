import { z } from 'zod';

export const variantSchema = z.object({
  size: z.string({ required_error: 'Variant size is required' }).trim().min(1, 'Variant size cannot be empty'),
  stock: z
    .number({ required_error: 'Variant stock is required' })
    .int('Variant stock must be an integer')
    .min(0, 'Variant stock cannot be negative'),
});

export const createProductSchema = z
  .object({
    name: z
      .string({ required_error: 'Product name is required' })
      .trim()
      .min(1, 'Product name cannot be empty')
      .max(200, 'Product name must not exceed 200 characters'),
    categoryId: z.string({ required_error: 'Category ID is required' }).uuid('Invalid Category ID format'),
    color: z
      .string({ required_error: 'Product color is required' })
      .trim()
      .min(1, 'Product color cannot be empty')
      .max(50, 'Color must not exceed 50 characters'),
    gst: z
      .number({ required_error: 'GST is required' })
      .min(0, 'GST percentage cannot be negative')
      .max(100, 'GST percentage cannot exceed 100'),
    description: z
      .string({ required_error: 'Product description is required' })
      .trim()
      .min(1, 'Description cannot be empty'),
    basePrice: z
      .number({ required_error: 'Base price is required' })
      .min(0, 'Base price cannot be negative'),
    sellPrice: z
      .number({ required_error: 'Sell price is required' })
      .min(0, 'Sell price cannot be negative'),
    stock: z
      .number({ required_error: 'Stock is required' })
      .int('Stock must be an integer')
      .min(0, 'Stock cannot be negative'),
    variants: z.array(variantSchema).optional().default([]),
  })
  .refine((data) => data.sellPrice <= data.basePrice, {
    message: 'Product sellPrice must be less than or equal to basePrice',
    path: ['sellPrice'],
  })
  .refine(
    (data) => {
      const sizes = data.variants.map((v) => v.size.toLowerCase());
      return new Set(sizes).size === sizes.length;
    },
    {
      message: 'Duplicate size variants are not allowed for the same product',
      path: ['variants'],
    }
  );

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    categoryId: z.string().uuid().optional(),
    color: z.string().trim().min(1).max(50).optional(),
    gst: z.number().min(0).max(100).optional(),
    description: z.string().trim().min(1).optional(),
    basePrice: z.number().min(0).optional(),
    sellPrice: z.number().min(0).optional(),
    stock: z.number().int().min(0).optional(),
    variants: z.array(variantSchema).optional(),
    existingMediaIds: z.array(z.string().uuid()).optional(),
    removeMediaIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (data) => {
      if (data.basePrice !== undefined && data.sellPrice !== undefined) {
        return data.sellPrice <= data.basePrice;
      }
      return true;
    },
    {
      message: 'Product sellPrice must be less than or equal to basePrice',
      path: ['sellPrice'],
    }
  )
  .refine(
    (data) => {
      if (data.variants) {
        const sizes = data.variants.map((v) => v.size.toLowerCase());
        return new Set(sizes).size === sizes.length;
      }
      return true;
    },
    {
      message: 'Duplicate size variants are not allowed for the same product',
      path: ['variants'],
    }
  );
