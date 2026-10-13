import { z } from 'zod';

const stringArrayPreprocess = (val: unknown) => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Fall back to comma splitting below
      }
    }
    if (trimmed.length > 0) {
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }
  return [];
};

const optionalStringArrayPreprocess = (val: unknown) => {
  if (val === undefined || val === null || val === '') return undefined;
  return stringArrayPreprocess(val);
};

const booleanPreprocess = (val: unknown) => {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'string') return val.toLowerCase() === 'true';
  return Boolean(val);
};

export const createBlogSchema = z.object({
  title: z
    .string({ required_error: 'Blog title is required' })
    .min(3, 'Title must be at least 3 characters long')
    .max(255, 'Title must not exceed 255 characters'),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters long')
    .max(255, 'Slug must not exceed 255 characters')
    .optional(),
  description: z
    .string({ required_error: 'Blog description is required' })
    .min(5, 'Description must be at least 5 characters long')
    .max(2000, 'Description must not exceed 2000 characters'),
  content: z
    .string({ required_error: 'Full blog content is required' })
    .min(10, 'Blog content must be at least 10 characters long'),
  category: z
    .string({ required_error: 'Blog category is required' })
    .min(2, 'Category must be at least 2 characters long')
    .max(100, 'Category must not exceed 100 characters'),
  tags: z.preprocess(stringArrayPreprocess, z.array(z.string().min(1).max(50))).default([]),
  author: z.string().max(100, 'Author name must not exceed 100 characters').optional(),
  seoTitle: z.string().max(255, 'SEO title must not exceed 255 characters').optional(),
  metaDescription: z.string().max(1000, 'Meta description must not exceed 1000 characters').optional(),
  keywords: z.preprocess(stringArrayPreprocess, z.array(z.string().min(1).max(100))).default([]),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  featuredImageAlt: z.string().max(255, 'Featured image alt text must not exceed 255 characters').optional(),
  imageAltTexts: z.preprocess(optionalStringArrayPreprocess, z.array(z.string()).optional()),
});

export const updateBlogSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters long')
    .max(255, 'Title must not exceed 255 characters')
    .optional(),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters long')
    .max(255, 'Slug must not exceed 255 characters')
    .optional(),
  description: z
    .string()
    .min(5, 'Description must be at least 5 characters long')
    .max(2000, 'Description must not exceed 2000 characters')
    .optional(),
  content: z
    .string()
    .min(10, 'Blog content must be at least 10 characters long')
    .optional(),
  category: z
    .string()
    .min(2, 'Category must be at least 2 characters long')
    .max(100, 'Category must not exceed 100 characters')
    .optional(),
  tags: z.preprocess(optionalStringArrayPreprocess, z.array(z.string().min(1).max(50)).optional()),
  author: z.string().max(100, 'Author name must not exceed 100 characters').optional(),
  seoTitle: z.string().max(255, 'SEO title must not exceed 255 characters').nullable().optional(),
  metaDescription: z.string().max(1000, 'Meta description must not exceed 1000 characters').nullable().optional(),
  keywords: z.preprocess(optionalStringArrayPreprocess, z.array(z.string().min(1).max(100)).optional()),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  featuredImageAlt: z.string().max(255, 'Featured image alt text must not exceed 255 characters').nullable().optional(),
  removeFeaturedImage: z.preprocess(booleanPreprocess, z.boolean().optional()),
  removeImageIds: z.preprocess(optionalStringArrayPreprocess, z.array(z.string().uuid()).optional()),
  imageAltTexts: z.preprocess(optionalStringArrayPreprocess, z.array(z.string()).optional()),
});

export const uploadContentImageSchema = z.object({
  altText: z.string().max(255, 'Alt text must not exceed 255 characters').optional(),
  blogId: z.string().uuid('Invalid blogId format').optional(),
});

export const updateImageAltSchema = z.object({
  altText: z.string({ required_error: 'altText is required' }).max(255, 'Alt text must not exceed 255 characters'),
  isFeatured: z.boolean().optional(),
});

export const queryBlogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'publishedAt', 'title']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
