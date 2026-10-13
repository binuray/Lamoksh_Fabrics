import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/database';
import { hashPassword } from '../src/utils/password';
import { issueTokens } from '../src/services/token.service';
import { OrderStatus, PaymentStatus, ReviewStatus } from '@prisma/client';

jest.setTimeout(30000);

describe('Reviews & Ratings Backend Module Test Suite', () => {
  // Test Users & Tokens
  let adminUser: any;
  let adminToken: string;
  let customerA: any;
  let customerAToken: string;
  let customerB: any;
  let customerBToken: string;

  // Test Catalog & Orders
  let testCategory: any;
  let testProduct1: any;
  let testProduct2: any;
  let testProductNotInOrder: any;

  let deliveredOrderCustomerA: any;
  let pendingOrderCustomerA: any;
  let cancelledOrderCustomerA: any;
  let deliveredOrderCustomerB: any;

  // Track created test review IDs for cleanup
  let createdReviewId: string;
  let secondReviewId: string;

  const testSuffix = Date.now().toString();

  beforeAll(async () => {
    // 1. Setup ADMIN role and test admin user
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

    const passwordHash = await hashPassword('TestPassword@123');

    // Create Admin User
    adminUser = await prisma.user.create({
      data: {
        name: `Review Admin ${testSuffix}`,
        email: `review_admin_${testSuffix}@example.com`,
        mobile: `8${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
        passwordHash,
        roleId: adminRole.id,
        isVerified: true,
        isActive: true,
      },
    });
    const adminTokens = await issueTokens(adminUser.id, 'ADMIN');
    adminToken = adminTokens.accessToken;

    // Create Customer A
    customerA = await prisma.user.create({
      data: {
        name: `Review Customer A ${testSuffix}`,
        email: `review_cust_a_${testSuffix}@example.com`,
        mobile: `8${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
        passwordHash,
        roleId: userRole.id,
        isVerified: true,
        isActive: true,
      },
    });
    const customerATokens = await issueTokens(customerA.id, 'USER');
    customerAToken = customerATokens.accessToken;

    // Create Customer B
    customerB = await prisma.user.create({
      data: {
        name: `Review Customer B ${testSuffix}`,
        email: `review_cust_b_${testSuffix}@example.com`,
        mobile: `8${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
        passwordHash,
        roleId: userRole.id,
        isVerified: true,
        isActive: true,
      },
    });
    const customerBTokens = await issueTokens(customerB.id, 'USER');
    customerBToken = customerBTokens.accessToken;

    // 2. Setup Category & Products
    testCategory = await prisma.category.create({
      data: {
        name: `ReviewCat_${testSuffix}`,
      },
    });

    testProduct1 = await prisma.product.create({
      data: {
        name: `ReviewTest Product 1 ${testSuffix}`,
        categoryId: testCategory.id,
        color: 'Blue',
        gst: 18,
        description: 'Quality blue product for reviews testing',
        basePrice: 500,
        sellPrice: 450,
        stock: 50,
      },
    });

    testProduct2 = await prisma.product.create({
      data: {
        name: `ReviewTest Product 2 ${testSuffix}`,
        categoryId: testCategory.id,
        color: 'Red',
        gst: 18,
        description: 'Quality red product for reviews testing',
        basePrice: 800,
        sellPrice: 750,
        stock: 30,
      },
    });

    testProductNotInOrder = await prisma.product.create({
      data: {
        name: `ReviewTest Product NotInOrder ${testSuffix}`,
        categoryId: testCategory.id,
        color: 'Green',
        gst: 12,
        description: 'Product never purchased',
        basePrice: 300,
        sellPrice: 280,
        stock: 20,
      },
    });

    // 3. Create Orders in different statuses

    // DELIVERED order for Customer A (contains testProduct1)
    deliveredOrderCustomerA = await prisma.order.create({
      data: {
        orderNumber: `ORD-DEL-A-${testSuffix}`,
        trackingToken: `trk_del_a_${testSuffix}`,
        userId: customerA.id,
        customerName: customerA.name,
        customerEmail: customerA.email,
        customerMobile: customerA.mobile,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID,
        subtotal: 450,
        totalAmount: 450,
        items: {
          create: [
            {
              productId: testProduct1.id,
              productName: testProduct1.name,
              productDescription: testProduct1.description,
              quantity: 1,
              unitBasePrice: 500,
              unitSellPrice: 450,
              gst: 18,
              lineTotal: 450,
            },
          ],
        },
      },
      include: { items: true },
    });

    // PENDING order for Customer A (contains testProduct1)
    pendingOrderCustomerA = await prisma.order.create({
      data: {
        orderNumber: `ORD-PEN-A-${testSuffix}`,
        trackingToken: `trk_pen_a_${testSuffix}`,
        userId: customerA.id,
        customerName: customerA.name,
        customerEmail: customerA.email,
        customerMobile: customerA.mobile,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: 450,
        totalAmount: 450,
        items: {
          create: [
            {
              productId: testProduct1.id,
              productName: testProduct1.name,
              productDescription: testProduct1.description,
              quantity: 1,
              unitBasePrice: 500,
              unitSellPrice: 450,
              gst: 18,
              lineTotal: 450,
            },
          ],
        },
      },
      include: { items: true },
    });

    // CANCELLED order for Customer A (contains testProduct1)
    cancelledOrderCustomerA = await prisma.order.create({
      data: {
        orderNumber: `ORD-CAN-A-${testSuffix}`,
        trackingToken: `trk_can_a_${testSuffix}`,
        userId: customerA.id,
        customerName: customerA.name,
        customerEmail: customerA.email,
        customerMobile: customerA.mobile,
        status: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.FAILED,
        subtotal: 450,
        totalAmount: 450,
        items: {
          create: [
            {
              productId: testProduct1.id,
              productName: testProduct1.name,
              productDescription: testProduct1.description,
              quantity: 1,
              unitBasePrice: 500,
              unitSellPrice: 450,
              gst: 18,
              lineTotal: 450,
            },
          ],
        },
      },
      include: { items: true },
    });

    // DELIVERED order for Customer B (contains testProduct1)
    deliveredOrderCustomerB = await prisma.order.create({
      data: {
        orderNumber: `ORD-DEL-B-${testSuffix}`,
        trackingToken: `trk_del_b_${testSuffix}`,
        userId: customerB.id,
        customerName: customerB.name,
        customerEmail: customerB.email,
        customerMobile: customerB.mobile,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID,
        subtotal: 450,
        totalAmount: 450,
        items: {
          create: [
            {
              productId: testProduct1.id,
              productName: testProduct1.name,
              productDescription: testProduct1.description,
              quantity: 1,
              unitBasePrice: 500,
              unitSellPrice: 450,
              gst: 18,
              lineTotal: 450,
            },
          ],
        },
      },
      include: { items: true },
    });
  });

  afterAll(async () => {
    // Isolated Cleanup: delete only records created during this test suite
    try {
      await prisma.review.deleteMany({
        where: {
          OR: [
            { userId: customerA.id },
            { userId: customerB.id },
            { productId: testProduct1.id },
            { productId: testProduct2.id },
          ],
        },
      });

      const orderIds = [
        deliveredOrderCustomerA?.id,
        pendingOrderCustomerA?.id,
        cancelledOrderCustomerA?.id,
        deliveredOrderCustomerB?.id,
      ].filter(Boolean);

      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });

      const productIds = [testProduct1?.id, testProduct2?.id, testProductNotInOrder?.id].filter(Boolean);
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });

      if (testCategory?.id) {
        await prisma.category.delete({ where: { id: testCategory.id } });
      }

      const userIds = [adminUser?.id, customerA?.id, customerB?.id].filter(Boolean);
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } catch (err) {
      console.error('Cleanup error in review test:', err);
    } finally {
      await prisma.$disconnect();
    }
  });

  // ==========================================
  // 1. SUBMIT REVIEW - BUSINESS LOGIC & VALIDATIONS
  // ==========================================
  describe('1. Review Submission Eligibility & DB Verification', () => {
    it('should successfully submit review when order is DELIVERED and product is in order', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: testProduct1.id,
          orderId: deliveredOrderCustomerA.id,
          rating: 5,
          comment: 'Outstanding quality and very fast shipping! Loved it.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.review).toBeDefined();
      expect(res.body.data.review.userId).toBe(customerA.id);
      expect(res.body.data.review.productId).toBe(testProduct1.id);
      expect(res.body.data.review.orderId).toBe(deliveredOrderCustomerA.id);
      expect(res.body.data.review.rating).toBe(5);
      expect(res.body.data.review.comment).toBe('Outstanding quality and very fast shipping! Loved it.');
      expect(res.body.data.review.status).toBe(ReviewStatus.PENDING);
      expect(res.body.data.review.createdAt).toBeDefined();

      createdReviewId = res.body.data.review.id;
    });

    it('should reject review submission for PENDING orders with 400', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: testProduct1.id,
          orderId: pendingOrderCustomerA.id,
          rating: 4,
          comment: 'Waiting for this product.',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/delivered/i);
    });

    it('should reject review submission for CANCELLED orders with 400', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: testProduct1.id,
          orderId: cancelledOrderCustomerA.id,
          rating: 1,
          comment: 'Cancelled order review attempt.',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/delivered/i);
    });

    it('should reject review submission when order does not belong to logged-in user with 403', async () => {
      // Customer B trying to review Customer A's delivered order
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({
          productId: testProduct1.id,
          orderId: deliveredOrderCustomerA.id,
          rating: 4,
          comment: 'Attempting to review someone else order.',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/own orders/i);
    });

    it('should reject review submission when product is not part of the order with 400', async () => {
      // Product was never part of deliveredOrderCustomerA
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: testProductNotInOrder.id,
          orderId: deliveredOrderCustomerA.id,
          rating: 3,
          comment: 'This product was not in my order.',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not found in the specified order/i);
    });

    it('should prevent duplicate reviews for the same customer, product, and order with 409', async () => {
      // Customer A already reviewed testProduct1 in deliveredOrderCustomerA
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: testProduct1.id,
          orderId: deliveredOrderCustomerA.id,
          rating: 4,
          comment: 'Trying to post duplicate review.',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already submitted a review/i);
    });

    it('should allow Customer B to review the same product for their own delivered order', async () => {
      // Customer B reviews testProduct1 in their own delivered order
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerBToken}`)
        .send({
          productId: testProduct1.id,
          orderId: deliveredOrderCustomerB.id,
          rating: 4,
          comment: 'Great blue fabric, nicely stitched.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.review.userId).toBe(customerB.id);

      secondReviewId = res.body.data.review.id;
    });

    it('should return 404 if product does not exist in database', async () => {
      const nonExistentId = '11111111-2222-3333-4444-555555555555';
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: nonExistentId,
          orderId: deliveredOrderCustomerA.id,
          rating: 5,
          comment: 'Fake product review.',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/product not found/i);
    });

    it('should return 404 if order does not exist in database', async () => {
      const nonExistentOrderId = '99999999-8888-7777-6666-555555555555';
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: testProduct1.id,
          orderId: nonExistentOrderId,
          rating: 5,
          comment: 'Fake order review.',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/order not found/i);
    });

    it('should support review submission via nested route /api/v1/products/:productId/reviews', async () => {
      // Create another delivered order for Customer A with testProduct2
      const orderProd2 = await prisma.order.create({
        data: {
          orderNumber: `ORD-DEL-P2-${testSuffix}`,
          trackingToken: `trk_del_p2_${testSuffix}`,
          userId: customerA.id,
          customerName: customerA.name,
          customerEmail: customerA.email,
          customerMobile: customerA.mobile,
          status: OrderStatus.DELIVERED,
          paymentStatus: PaymentStatus.PAID,
          subtotal: 750,
          totalAmount: 750,
          items: {
            create: [
              {
                productId: testProduct2.id,
                productName: testProduct2.name,
                productDescription: testProduct2.description,
                quantity: 1,
                unitBasePrice: 800,
                unitSellPrice: 750,
                gst: 18,
                lineTotal: 750,
              },
            ],
          },
        },
      });

      const res = await request(app)
        .post(`/api/v1/products/${testProduct2.id}/reviews`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          orderId: orderProd2.id,
          rating: 5,
          comment: 'Submitting review via nested products route.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.review.productId).toBe(testProduct2.id);

      // Clean up helper order & review
      await prisma.review.deleteMany({ where: { orderId: orderProd2.id } });
      await prisma.orderItem.deleteMany({ where: { orderId: orderProd2.id } });
      await prisma.order.delete({ where: { id: orderProd2.id } });
    });
  });

  // ==========================================
  // 2. INPUT VALIDATION & RATING CHECKS
  // ==========================================
  describe('2. Input Validation (Ratings, Comments & Formats)', () => {
    it('should reject rating 0 (below minimum 1) with 422', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: testProduct1.id,
          orderId: deliveredOrderCustomerA.id,
          rating: 0,
          comment: 'Rating 0 attempt.',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should reject rating 6 (above maximum 5) with 422', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: testProduct1.id,
          orderId: deliveredOrderCustomerA.id,
          rating: 6,
          comment: 'Rating 6 attempt.',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-integer decimal ratings like 3.5 with 422', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: testProduct1.id,
          orderId: deliveredOrderCustomerA.id,
          rating: 3.5,
          comment: 'Decimal rating attempt.',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should reject string rating like "five" with 422', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: testProduct1.id,
          orderId: deliveredOrderCustomerA.id,
          rating: 'five',
          comment: 'String rating attempt.',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should reject empty comment with 422', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: testProduct1.id,
          orderId: deliveredOrderCustomerA.id,
          rating: 5,
          comment: '',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should reject comment that is only whitespace with 422', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: testProduct1.id,
          orderId: deliveredOrderCustomerA.id,
          rating: 5,
          comment: '     ',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid UUID formats with 422', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          productId: 'not-a-uuid',
          orderId: 'also-not-a-uuid',
          rating: 5,
          comment: 'Invalid UUID format test.',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================
  // 3. AUTHENTICATION & AUTHORIZATION
  // ==========================================
  describe('3. Authentication & Authorization Enforcement', () => {
    it('should return 401 when submitting review without authentication token', async () => {
      const res = await request(app).post('/api/v1/reviews').send({
        productId: testProduct1.id,
        orderId: deliveredOrderCustomerA.id,
        rating: 5,
        comment: 'Unauthenticated review attempt.',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 when fetching my reviews without token', async () => {
      const res = await request(app).get('/api/v1/reviews/my-reviews');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 403 when customer tries to access admin reviews endpoint', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reviews')
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should return 403 when customer tries to moderate a review', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/reviews/${createdReviewId}/status`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({
          status: 'APPROVED',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================
  // 4. CUSTOMER LOGGED-IN REVIEWS
  // ==========================================
  describe('4. Logged-in Customer Review Retrieval', () => {
    it('should return reviews submitted by the logged-in customer via /my-reviews', async () => {
      const res = await request(app)
        .get('/api/v1/reviews/my-reviews')
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.reviews)).toBe(true);
      expect(res.body.data.reviews.length).toBeGreaterThanOrEqual(1);

      const review = res.body.data.reviews.find((r: any) => r.id === createdReviewId);
      expect(review).toBeDefined();
      expect(review.userId).toBe(customerA.id);
      expect(review.product).toBeDefined();
      expect(review.orderNumber).toBe(deliveredOrderCustomerA.orderNumber);
      expect(review.status).toBe(ReviewStatus.PENDING);
    });

    it('should return reviews submitted by Customer B isolating from Customer A', async () => {
      const res = await request(app)
        .get('/api/v1/reviews/my-reviews')
        .set('Authorization', `Bearer ${customerBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.reviews)).toBe(true);

      // Customer B should see their review, but NOT Customer A's review
      const hasCustomerAReview = res.body.data.reviews.some((r: any) => r.id === createdReviewId);
      expect(hasCustomerAReview).toBe(false);

      const hasCustomerBReview = res.body.data.reviews.some((r: any) => r.id === secondReviewId);
      expect(hasCustomerBReview).toBe(true);
    });
  });

  // ==========================================
  // 5. ADMIN REVIEW MODERATION & MANAGEMENT
  // ==========================================
  describe('5. Admin Review Management & Moderation Workflow', () => {
    it('should allow admin to view all reviews including pending ones', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reviews')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.reviews)).toBe(true);

      const found = res.body.data.reviews.find((r: any) => r.id === createdReviewId);
      expect(found).toBeDefined();
      expect(found.status).toBe(ReviewStatus.PENDING);
    });

    it('should allow admin to filter reviews by status=PENDING', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reviews?status=PENDING')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reviews.every((r: any) => r.status === ReviewStatus.PENDING)).toBe(true);
    });

    it('should allow admin to fetch single review details by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/reviews/${createdReviewId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.review.id).toBe(createdReviewId);
      expect(res.body.data.review.user.email).toBe(customerA.email);
    });

    it('should allow admin to approve a pending review via /approve endpoint', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/reviews/${createdReviewId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.review.status).toBe(ReviewStatus.APPROVED);

      // Verify in DB
      const dbReview = await prisma.review.findUnique({ where: { id: createdReviewId } });
      expect(dbReview?.status).toBe(ReviewStatus.APPROVED);
    });

    it('should allow admin to reject a review via /reject endpoint with feedback', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/reviews/${secondReviewId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          adminFeedback: 'Review comment violated community guidelines.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.review.status).toBe(ReviewStatus.REJECTED);
      expect(res.body.data.review.adminFeedback).toBe('Review comment violated community guidelines.');

      // Verify in DB
      const dbReview = await prisma.review.findUnique({ where: { id: secondReviewId } });
      expect(dbReview?.status).toBe(ReviewStatus.REJECTED);
      expect(dbReview?.adminFeedback).toBe('Review comment violated community guidelines.');
    });

    it('should allow admin to moderate review status via general /status endpoint', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/reviews/${secondReviewId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'APPROVED',
          adminFeedback: 'Approved upon re-review.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.review.status).toBe(ReviewStatus.APPROVED);
    });

    it('should return 404 when moderating a non-existent review ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .patch(`/api/v1/admin/reviews/${fakeId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'APPROVED',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================
  // 6. PUBLIC PRODUCT REVIEWS & RATINGS SUMMARY
  // ==========================================
  describe('6. Public Product Reviews & Aggregate Rating Calculations', () => {
    it('should fetch public reviews for a product via /products/:productId/reviews', async () => {
      const res = await request(app).get(`/api/v1/products/${testProduct1.id}/reviews`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.reviews)).toBe(true);
      expect(res.body.data.reviews.length).toBeGreaterThanOrEqual(1);

      // Verify reviewer name is surfaced, sensitive email is omitted
      const sample = res.body.data.reviews[0];
      expect(sample.user).toBeDefined();
      expect(sample.user.name).toBeDefined();
      expect(sample.rating).toBeDefined();
      expect(sample.comment).toBeDefined();
    });

    it('should fetch public reviews via alternate route /reviews/product/:productId', async () => {
      const res = await request(app).get(`/api/v1/reviews/product/${testProduct1.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.reviews)).toBe(true);
      expect(res.body.data.reviews.length).toBeGreaterThanOrEqual(1);
    });

    it('should calculate accurate average rating and review counts via /summary endpoint', async () => {
      const res = await request(app).get(`/api/v1/products/${testProduct1.id}/reviews/summary`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.productId).toBe(testProduct1.id);
      expect(typeof res.body.data.averageRating).toBe('number');
      expect(typeof res.body.data.totalReviews).toBe('number');
      expect(res.body.data.totalReviews).toBe(2); // Both createdReviewId (5) and secondReviewId (4) are APPROVED
      expect(res.body.data.averageRating).toBe(4.5); // (5 + 4) / 2 = 4.5
      expect(res.body.data.ratingDistribution).toBeDefined();
      expect(res.body.data.ratingDistribution[5]).toBe(1);
      expect(res.body.data.ratingDistribution[4]).toBe(1);
      expect(res.body.data.ratingDistribution[3]).toBe(0);
      expect(res.body.data.ratingDistribution[2]).toBe(0);
      expect(res.body.data.ratingDistribution[1]).toBe(0);
    });

    it('should return 404 when fetching reviews for a non-existent product', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app).get(`/api/v1/products/${fakeId}/reviews`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should allow filtering public reviews by rating stars ?rating=5', async () => {
      const res = await request(app).get(`/api/v1/products/${testProduct1.id}/reviews?rating=5`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reviews.every((r: any) => r.rating === 5)).toBe(true);
    });
  });

  // ==========================================
  // 7. ADMIN DELETION OF REVIEWS
  // ==========================================
  describe('7. Admin Review Deletion', () => {
    it('should allow admin to delete a review', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/reviews/${secondReviewId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/deleted/i);

      // Verify deletion in DB
      const check = await prisma.review.findUnique({ where: { id: secondReviewId } });
      expect(check).toBeNull();
    });

    it('should reflect updated average rating after review deletion', async () => {
      const res = await request(app).get(`/api/v1/products/${testProduct1.id}/reviews/summary`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalReviews).toBe(1); // Only createdReviewId (rating: 5) remains
      expect(res.body.data.averageRating).toBe(5);
    });
  });
});
