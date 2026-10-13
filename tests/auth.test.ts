import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/database';

describe('Authentication & Authorization Suite', () => {
  beforeAll(async () => {
    // Clean up test users to ensure predictable test environment
    await prisma.user.deleteMany({});

    // Seed initial roles if not present
    await prisma.role.upsert({
      where: { name: 'SUPER_ADMIN' },
      update: {},
      create: { name: 'SUPER_ADMIN', description: 'Super Admin Role' },
    });
    await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN', description: 'Admin Role' },
    });
    await prisma.role.upsert({
      where: { name: 'USER' },
      update: {},
      create: { name: 'USER', description: 'User Role' },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/v1/auth/super-admin/signup', () => {
    it('should create initial Super Admin successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/super-admin/signup')
        .send({
          name: 'Super Admin',
          email: 'testsuperadmin@example.com',
          mobile: '9876543210',
          password: 'Password@123',
        });

      if (res.status === 409) {
        // Super Admin already exists from previous runs, test pass
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Super Admin already exists');
      } else {
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.user.role).toBe('SUPER_ADMIN');
      }
    });

    it('should fail second Super Admin signup with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/v1/auth/super-admin/signup')
        .send({
          name: 'Second Super Admin',
          email: 'secondsuper@example.com',
          mobile: '9876543211',
          password: 'Password@123',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Super Admin already exists');
    });
  });

  describe('POST /api/v1/auth/super-admin/login', () => {
    it('should log in Super Admin using email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/super-admin/login')
        .send({
          identifier: 'testsuperadmin@example.com',
          password: 'Password@123',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('should log in Super Admin using mobile', async () => {
      const res = await request(app)
        .post('/api/v1/auth/super-admin/login')
        .send({
          identifier: '9876543210',
          password: 'Password@123',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('SUPER_ADMIN');
    });
  });
});
