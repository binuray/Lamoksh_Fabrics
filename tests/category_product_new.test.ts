import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/database';
import { hashPassword } from '../src/utils/password';

import { issueTokens } from '../src/services/token.service';

describe('Category & Product Management Module Test Suite', () => {
  let superAdminToken: string;
  let createdCategoryId: string;
  let createdProductId: string;
  let firstProductId: string;

  beforeAll(async () => {
    // Clean up test category and products if left over from previous runs
    await prisma.productVariant.deleteMany({});
    await prisma.productMedia.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({ where: { name: 'Clothing & Apparel' } });

    // Seed initial Super Admin role
    const superAdminRole = await prisma.role.upsert({
      where: { name: 'SUPER_ADMIN' },
      update: {},
      create: { name: 'SUPER_ADMIN', description: 'Super Admin Role' },
    });

    let testSuperAdmin = await prisma.user.findFirst({
      where: { roleId: superAdminRole.id, deletedAt: null },
    });

    if (!testSuperAdmin) {
      const passwordHash = await hashPassword('TestPassword@123');
      const uniqueId = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      testSuperAdmin = await prisma.user.create({
        data: {
          name: 'Isolated Super Admin Test',
          email: `cat_prod_admin_${uniqueId}@example.com`,
          mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
          passwordHash,
          roleId: superAdminRole.id,
          isVerified: true,
          isActive: true,
        },
      });
    }

    const tokens = await issueTokens(testSuperAdmin.id, 'SUPER_ADMIN');
    superAdminToken = tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Category Module APIs', () => {
    it('should create a new category', async () => {
      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: '  Clothing & Apparel  ' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.category.name).toBe('Clothing & Apparel');

      createdCategoryId = res.body.data.category.id;
    });

    it('should reject duplicate category name', async () => {
      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Clothing & Apparel' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should fetch all admin categories', async () => {
      const res = await request(app)
        .get('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.categories)).toBe(true);
    });

    it('should fetch public categories', async () => {
      const res = await request(app).get('/api/v1/categories');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.categories)).toBe(true);
    });
  });

  describe('2. Product Module APIs & Validations', () => {
    it('should reject product creation if sellPrice > basePrice', async () => {
      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('name', 'Premium Cotton T-Shirt')
        .field('categoryId', createdCategoryId)
        .field('color', 'Black')
        .field('gst', '18')
        .field('description', '100% Cotton Premium T-Shirt')
        .field('basePrice', '500')
        .field('sellPrice', '800')
        .field('stock', '25');

      expect(res.status).toBe(422);
    });

    it('should reject product creation with 0 media files', async () => {
      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('name', 'Premium Cotton T-Shirt')
        .field('categoryId', createdCategoryId)
        .field('color', 'Black')
        .field('gst', '18')
        .field('description', '100% Cotton Premium T-Shirt')
        .field('basePrice', '1000')
        .field('sellPrice', '899')
        .field('stock', '25');

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('At least 1 media file');
    });

    it('should create product with size variants and image file upload', async () => {
      const variants = [
        { size: 'S', stock: 10 },
        { size: 'M', stock: 15 },
      ];

      const dummyImageBuffer = Buffer.from('fake-image-binary-content');

      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('name', 'Premium Cotton T-Shirt')
        .field('categoryId', createdCategoryId)
        .field('color', 'Black')
        .field('gst', '18')
        .field('description', '100% Cotton Premium T-Shirt')
        .field('basePrice', '1000')
        .field('sellPrice', '899')
        .field('stock', '25')
        .field('variants', JSON.stringify(variants))
        .attach('images', dummyImageBuffer, 'tshirt.png');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.name).toBe('Premium Cotton T-Shirt');
      expect(res.body.data.product.variants.length).toBe(2);
      expect(res.body.data.product.media.length).toBe(1);

      firstProductId = res.body.data.product.id;
      createdProductId = res.body.data.product.id;
    });

    it('should reject invalid numeric fields (e.g. gst = "abc")', async () => {
      const dummyImageBuffer = Buffer.from('fake-image-binary-content');
      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('name', 'Test Product')
        .field('categoryId', createdCategoryId)
        .field('color', 'Black')
        .field('gst', 'abc')
        .field('description', 'test description')
        .field('basePrice', '1000')
        .field('sellPrice', '899')
        .field('stock', '50')
        .attach('images', dummyImageBuffer, 'test.png');

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'gst' })])
      );
    });

    it('should reject negative stock (e.g. stock = "-10")', async () => {
      const dummyImageBuffer = Buffer.from('fake-image-binary-content');
      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('name', 'Test Product')
        .field('categoryId', createdCategoryId)
        .field('color', 'Black')
        .field('gst', '18')
        .field('description', 'test description')
        .field('basePrice', '1000')
        .field('sellPrice', '899')
        .field('stock', '-10')
        .attach('images', dummyImageBuffer, 'test.png');

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'stock' })])
      );
    });

    it('should reject invalid variants JSON string', async () => {
      const dummyImageBuffer = Buffer.from('fake-image-binary-content');
      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('name', 'Test Product')
        .field('categoryId', createdCategoryId)
        .field('color', 'Black')
        .field('gst', '18')
        .field('description', 'test description')
        .field('basePrice', '1000')
        .field('sellPrice', '899')
        .field('stock', '50')
        .field('variants', 'invalid-json')
        .attach('images', dummyImageBuffer, 'test.png');

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'variants' })])
      );
    });

    it('should reject non-array variants JSON string (e.g. "{}" object)', async () => {
      const dummyImageBuffer = Buffer.from('fake-image-binary-content');
      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('name', 'Test Product')
        .field('categoryId', createdCategoryId)
        .field('color', 'Black')
        .field('gst', '18')
        .field('description', 'test description')
        .field('basePrice', '1000')
        .field('sellPrice', '899')
        .field('stock', '50')
        .field('variants', '{}')
        .attach('images', dummyImageBuffer, 'test.png');

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'variants' })])
      );
    });

    it('should reject variants with invalid negative stock', async () => {
      const dummyImageBuffer = Buffer.from('fake-image-binary-content');
      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('name', 'Test Product')
        .field('categoryId', createdCategoryId)
        .field('color', 'Black')
        .field('gst', '18')
        .field('description', 'test description')
        .field('basePrice', '1000')
        .field('sellPrice', '899')
        .field('stock', '50')
        .field('variants', '[{"size":"M","stock":-5}]')
        .attach('images', dummyImageBuffer, 'test.png');

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should create product with exact Postman form-data format', async () => {
      const dummyImageBuffer = Buffer.from('fake-image-binary-content');

      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('name', 'Banarsi saree')
        .field('categoryId', createdCategoryId)
        .field('color', 'black')
        .field('gst', '18')
        .field('description', 'test description')
        .field('basePrice', '1000')
        .field('sellPrice', '899')
        .field('stock', '50')
        .field('variants', '[{"size":"S","stock":10},{"size":"M","stock":20}]')
        .attach('images', dummyImageBuffer, 'saree.png');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.name).toBe('Banarsi saree');
      expect(res.body.data.product.variants.length).toBe(2);
      expect(res.body.data.product.media.length).toBe(1);

      createdProductId = res.body.data.product.id;
    });

    it('should update product successfully via multipart/form-data', async () => {
      const res = await request(app)
        .put(`/api/v1/admin/products/${createdProductId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('sellPrice', '850')
        .field('stock', '60')
        .field('variants', '[{"size":"S","stock":15},{"size":"M","stock":25}]');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.product.sellPrice)).toBe(850);
      expect(res.body.data.product.stock).toBe(60);
    });

    it('should prevent category deletion when active products exist', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/categories/${createdCategoryId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Category cannot be deleted because products are associated with it');
    });

    it('should fetch public product details by id', async () => {
      const res = await request(app).get(`/api/v1/products/${createdProductId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.name).toBe('Banarsi saree');
      expect(res.body.data.product.color).toBe('black');
    });

    it('should delete products successfully and allow category deletion after', async () => {
      const prod1DeleteRes = await request(app)
        .delete(`/api/v1/admin/products/${firstProductId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(prod1DeleteRes.status).toBe(200);

      const prod2DeleteRes = await request(app)
        .delete(`/api/v1/admin/products/${createdProductId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(prod2DeleteRes.status).toBe(200);

      const catDeleteRes = await request(app)
        .delete(`/api/v1/admin/categories/${createdCategoryId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(catDeleteRes.status).toBe(200);
    });
  });
});
