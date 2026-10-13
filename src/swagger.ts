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
