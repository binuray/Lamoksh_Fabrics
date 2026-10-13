import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/database';
import { hashPassword } from '../src/utils/password';
import { issueTokens } from '../src/services/token.service';

describe('Contact & Enquiry Management Backend Module Test Suite', () => {
  let adminToken: string;
  let customerToken: string;
  const createdEnquiryIds: string[] = [];

  const testSuffix = Date.now().toString();

  beforeAll(async () => {
    // 1. Ensure ADMIN role and test admin user
    const adminRole = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN', description: 'Admin Role' },
    });

    const userRole = await prisma.role.upsert({
      where: { name: 'USER' },
      update: {},
      create: { name: 'USER', description: 'User Role' },
    });

    const passwordHash = await hashPassword('TestPass@1234');

    // Create unique Admin User for this test suite
    const adminUser = await prisma.user.create({
      data: {
        name: `Enquiry Admin ${testSuffix}`,
        email: `enquiry_admin_${testSuffix}@example.com`,
        mobile: `7${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
        passwordHash,
        roleId: adminRole.id,
        isVerified: true,
        isActive: true,
      },
    });

    const adminTokens = await issueTokens(adminUser.id, 'ADMIN');
    adminToken = adminTokens.accessToken;

    // Create unique Customer User for testing authorization checks
    const customerUser = await prisma.user.create({
      data: {
        name: `Enquiry Customer ${testSuffix}`,
        email: `enquiry_cust_${testSuffix}@example.com`,
        mobile: `7${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
        passwordHash,
        roleId: userRole.id,
        isVerified: true,
        isActive: true,
      },
    });

    const customerTokens = await issueTokens(customerUser.id, 'USER');
    customerToken = customerTokens.accessToken;
  });

  afterAll(async () => {
    // Clean up only the enquiries created during this test suite
    if (createdEnquiryIds.length > 0) {
      await prisma.enquiry.deleteMany({
        where: { id: { in: createdEnquiryIds } },
      });
    }

    // Clean up test users
    await prisma.user.deleteMany({
      where: { email: { contains: testSuffix } },
    });

    await prisma.$disconnect();
  });

  // =========================================================================
  // 1. PUBLIC ENQUIRY SUBMISSION TESTS (ALL FIELDS OPTIONAL)
  // =========================================================================
  describe('Public Enquiry Submission (All Fields Optional)', () => {
    it('should submit an enquiry with empty body ({})', async () => {
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Enquiry submitted successfully');
      expect(res.body.data.enquiry).toBeDefined();
      expect(res.body.data.enquiry.id).toBeDefined();
      expect(res.body.data.enquiry.name).toBeNull();
      expect(res.body.data.enquiry.email).toBeNull();
      expect(res.body.data.enquiry.mobileNumber).toBeNull();
      expect(res.body.data.enquiry.message).toBeNull();

      createdEnquiryIds.push(res.body.data.enquiry.id);
    });

    it('should submit an enquiry with empty strings ("")', async () => {
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({
          name: '',
          email: '',
          mobileNumber: '',
          message: '',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enquiry.id).toBeDefined();
      expect(res.body.data.enquiry.name).toBeNull();
      expect(res.body.data.enquiry.email).toBeNull();
      expect(res.body.data.enquiry.mobileNumber).toBeNull();
      expect(res.body.data.enquiry.message).toBeNull();

      createdEnquiryIds.push(res.body.data.enquiry.id);
    });

    it('should submit an enquiry with null values', async () => {
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({
          name: null,
          email: null,
          mobileNumber: null,
          message: null,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enquiry.id).toBeDefined();
      createdEnquiryIds.push(res.body.data.enquiry.id);
    });

    it('should submit an enquiry with only name provided', async () => {
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({ name: 'Rahul Sharma' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enquiry.name).toBe('Rahul Sharma');
      expect(res.body.data.enquiry.email).toBeNull();
      expect(res.body.data.enquiry.mobileNumber).toBeNull();
      expect(res.body.data.enquiry.message).toBeNull();

      createdEnquiryIds.push(res.body.data.enquiry.id);
    });

    it('should submit an enquiry with only email provided', async () => {
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({ email: 'rahul.enquiry@example.com' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enquiry.name).toBeNull();
      expect(res.body.data.enquiry.email).toBe('rahul.enquiry@example.com');
      expect(res.body.data.enquiry.mobileNumber).toBeNull();
      expect(res.body.data.enquiry.message).toBeNull();

      createdEnquiryIds.push(res.body.data.enquiry.id);
    });

    it('should submit an enquiry with only mobileNumber provided', async () => {
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({ mobileNumber: '9876543210' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enquiry.name).toBeNull();
      expect(res.body.data.enquiry.email).toBeNull();
      expect(res.body.data.enquiry.mobileNumber).toBe('9876543210');
      expect(res.body.data.enquiry.message).toBeNull();

      createdEnquiryIds.push(res.body.data.enquiry.id);
    });

    it('should submit an enquiry with only message provided', async () => {
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({ message: 'I need pricing details for wholesale silk fabric.' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enquiry.name).toBeNull();
      expect(res.body.data.enquiry.email).toBeNull();
      expect(res.body.data.enquiry.mobileNumber).toBeNull();
      expect(res.body.data.enquiry.message).toBe('I need pricing details for wholesale silk fabric.');

      createdEnquiryIds.push(res.body.data.enquiry.id);
    });

    it('should submit an enquiry with all valid fields provided', async () => {
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({
          name: 'Priya Patel',
          email: 'priya.patel@example.com',
          mobileNumber: '+919876543210',
          message: 'Interested in bulk cotton fabric samples.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enquiry.name).toBe('Priya Patel');
      expect(res.body.data.enquiry.email).toBe('priya.patel@example.com');
      expect(res.body.data.enquiry.mobileNumber).toBe('+919876543210');
      expect(res.body.data.enquiry.message).toBe('Interested in bulk cotton fabric samples.');
      expect(res.body.data.enquiry.createdAt).toBeDefined();

      createdEnquiryIds.push(res.body.data.enquiry.id);
    });

    it('should submit an enquiry via /api/v1/contact endpoint alias', async () => {
      const res = await request(app)
        .post('/api/v1/contact')
        .send({
          name: 'Contact Form Visitor',
          email: 'visitor@example.com',
          message: 'Submitted via /contact',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enquiry.name).toBe('Contact Form Visitor');

      createdEnquiryIds.push(res.body.data.enquiry.id);
    });

    it('should accept mobile number supplied via "mobile" field alias', async () => {
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({
          name: 'Mobile Alias User',
          mobile: '9876543210',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enquiry.mobileNumber).toBe('9876543210');

      createdEnquiryIds.push(res.body.data.enquiry.id);
    });
  });

  // =========================================================================
  // 2. BASIC VALIDATION WHEN FIELD IS PROVIDED
  // =========================================================================
  describe('Basic Validation on Provided Fields', () => {
    it('should reject invalid email format with 422 Validation Error', async () => {
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({
          name: 'Test User',
          email: 'invalid-email-format',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation error');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: 'Invalid email address format',
          }),
        ])
      );
    });

    it('should reject invalid mobile number format (too short/random text) with 422', async () => {
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({
          name: 'Test User',
          mobileNumber: '12345',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'mobileNumber',
            message: 'Invalid mobile number format',
          }),
        ])
      );
    });

    it('should reject non-numeric mobile number characters with 422', async () => {
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({
          mobileNumber: 'abcdefghij',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should accept valid international mobile format (e.g. +14155552671)', async () => {
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({
          name: 'International Customer',
          mobileNumber: '+14155552671',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enquiry.mobileNumber).toBe('+14155552671');

      createdEnquiryIds.push(res.body.data.enquiry.id);
    });

    it('should accept valid Indian mobile number with whitespace or hyphens', async () => {
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({
          name: 'Spaced Mobile Customer',
          mobileNumber: '+91 9876543210',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enquiry.mobileNumber).toBe('+91 9876543210');

      createdEnquiryIds.push(res.body.data.enquiry.id);
    });
  });

  // =========================================================================
  // 3. ADMIN AUTHORIZATION & SECURITY CHECKS
  // =========================================================================
  describe('Admin Access Control & Security', () => {
    it('should reject admin listing enquiries without authentication token (401)', async () => {
      const res = await request(app).get('/api/v1/admin/enquiries');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-admin (customer) user from viewing enquiries (403)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/enquiries')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-admin from viewing enquiry details by ID (403)', async () => {
      const sampleId = createdEnquiryIds[0];
      const res = await request(app)
        .get(`/api/v1/admin/enquiries/${sampleId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-admin from deleting enquiries (403)', async () => {
      const sampleId = createdEnquiryIds[0];
      const res = await request(app)
        .delete(`/api/v1/admin/enquiries/${sampleId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 4. ADMIN VIEW ENQUIRIES (LISTING & SEARCH)
  // =========================================================================
  describe('Admin View Enquiries (Listing, Pagination & Search)', () => {
    it('should allow admin to view paginated enquiries', async () => {
      const res = await request(app)
        .get('/api/v1/admin/enquiries?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Enquiries retrieved successfully');
      expect(Array.isArray(res.body.data.enquiries)).toBe(true);
      expect(res.body.data.meta).toBeDefined();
      expect(res.body.data.meta.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data.meta.page).toBe(1);
      expect(res.body.data.meta.limit).toBe(10);
      expect(res.body.data.meta.totalPages).toBeGreaterThanOrEqual(1);
    });

    it('should allow admin to search enquiries by name or keyword', async () => {
      const res = await request(app)
        .get('/api/v1/admin/enquiries?search=Rahul')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.enquiries)).toBe(true);
      const matched = res.body.data.enquiries.some((e: any) =>
        e.name?.includes('Rahul') || e.email?.includes('Rahul')
      );
      expect(matched).toBe(true);
    });

    it('should allow admin to sort enquiries by oldest / newest', async () => {
      const res = await request(app)
        .get('/api/v1/admin/enquiries?sortBy=oldest&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.enquiries)).toBe(true);
    });
  });

  // =========================================================================
  // 5. ADMIN VIEW DETAILS & DELETE ENQUIRIES
  // =========================================================================
  describe('Admin View Details & Delete Enquiries', () => {
    let enquiryToDeleteId: string;

    beforeAll(async () => {
      // Create a dedicated enquiry for detail and delete tests
      const res = await request(app)
        .post('/api/v1/enquiries')
        .send({
          name: 'Enquiry For Deletion Test',
          email: 'delete.test@example.com',
          mobileNumber: '9123456789',
          message: 'Will be deleted in tests',
        });

      enquiryToDeleteId = res.body.data.enquiry.id;
      createdEnquiryIds.push(enquiryToDeleteId);
    });

    it('should allow admin to view details of an enquiry by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/enquiries/${enquiryToDeleteId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Enquiry details retrieved successfully');
      expect(res.body.data.enquiry.id).toBe(enquiryToDeleteId);
      expect(res.body.data.enquiry.name).toBe('Enquiry For Deletion Test');
      expect(res.body.data.enquiry.email).toBe('delete.test@example.com');
      expect(res.body.data.enquiry.mobileNumber).toBe('9123456789');
      expect(res.body.data.enquiry.message).toBe('Will be deleted in tests');
    });

    it('should return 404 when viewing non-existent enquiry by ID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/v1/admin/enquiries/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Enquiry not found');
    });

    it('should return 404 for invalid UUID format', async () => {
      const res = await request(app)
        .get('/api/v1/admin/enquiries/invalid-uuid-format')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Enquiry not found');
    });

    it('should allow admin to delete an enquiry permanently', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/enquiries/${enquiryToDeleteId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Enquiry deleted successfully');
      expect(res.body.data.id).toBe(enquiryToDeleteId);
    });

    it('should return 404 when attempting to fetch the deleted enquiry', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/enquiries/${enquiryToDeleteId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Enquiry not found');
    });

    it('should return 404 when attempting to delete non-existent enquiry', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .delete(`/api/v1/admin/enquiries/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Enquiry not found');
    });
  });
});
