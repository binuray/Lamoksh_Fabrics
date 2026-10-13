import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './config/env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Lamkosh E-Commerce Backend API',
      version: '1.0.0',
      description:
        'Production-ready E-Commerce architecture with RBAC, Authentication, Category Management, and Product Management modules.',
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}/api/v1`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Category: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Electronics' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        ProductVariant: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            size: { type: 'string', example: 'M' },
            stock: { type: 'integer', example: 20 },
          },
        },
        ProductMedia: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['IMAGE', 'VIDEO'], example: 'IMAGE' },
            url: { type: 'string', example: '/uploads/products/images/123456.jpg' },
            sortOrder: { type: 'integer', example: 0 },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Premium Cotton T-Shirt' },
            categoryId: { type: 'string', format: 'uuid' },
            color: { type: 'string', example: 'Black' },
            gst: { type: 'number', example: 18 },
            description: { type: 'string', example: '100% Cotton Premium T-Shirt' },
            basePrice: { type: 'number', example: 1000 },
            sellPrice: { type: 'number', example: 899 },
            stock: { type: 'integer', example: 25 },
            category: { $ref: '#/components/schemas/Category' },
            variants: { type: 'array', items: { $ref: '#/components/schemas/ProductVariant' } },
            media: { type: 'array', items: { $ref: '#/components/schemas/ProductMedia' } },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        BlogImage: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            url: { type: 'string', example: '/uploads/blogs/images/example.webp' },
            altText: { type: 'string', example: 'SEO Marketing Infographic' },
            isFeatured: { type: 'boolean', example: false },
          },
        },
        Blog: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string', example: 'Top 10 SEO Trends for 2026' },
            slug: { type: 'string', example: 'top-10-seo-trends-for-2026' },
            description: { type: 'string', example: 'Essential SEO strategies for modern digital marketing.' },
            content: { type: 'string', example: '<p>Search engine optimization in 2026 demands...</p>' },
            category: { type: 'string', example: 'Digital Marketing' },
            tags: { type: 'array', items: { type: 'string' }, example: ['SEO', 'Marketing'] },
            author: { type: 'string', example: 'Jane Doe' },
            seoTitle: { type: 'string', example: 'Top 10 SEO Trends for 2026 - Guide' },
            metaDescription: { type: 'string', example: 'Discover top SEO trends and insights.' },
            keywords: { type: 'array', items: { type: 'string' }, example: ['seo', 'marketing'] },
            status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], example: 'PUBLISHED' },
            featuredImage: { type: 'string', example: '/uploads/blogs/featured/example.webp' },
            featuredImageAlt: { type: 'string', example: 'Digital marketing overview' },
            publishedAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            images: { type: 'array', items: { $ref: '#/components/schemas/BlogImage' } },
          },
        },
        Review: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            productId: { type: 'string', format: 'uuid' },
            orderId: { type: 'string', format: 'uuid' },
            rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
            comment: { type: 'string', example: 'Excellent product quality!' },
            status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'], example: 'APPROVED' },
            adminFeedback: { type: 'string', nullable: true, example: null },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Enquiry: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', nullable: true, example: 'John Doe' },
            email: { type: 'string', format: 'email', nullable: true, example: 'john@example.com' },
            mobileNumber: { type: 'string', nullable: true, example: '+919876543210' },
            message: { type: 'string', nullable: true, example: 'Inquiry details...' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/app.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
