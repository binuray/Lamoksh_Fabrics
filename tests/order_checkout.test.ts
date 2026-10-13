import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/database';
import { hashPassword } from '../src/utils/password';
import { issueTokens } from '../src/services/token.service';

jest.setTimeout(30000);

describe('Order, Checkout & Profile Implementation Test Suite', () => {
  let initialSuperAdminSnapshot: any = null;

  let testAdminToken: string;
  let testAdminUser: any;
  let user1Token: string;
  let user1Id: string;
  let user1Email: string;
  let user2Token: string;
  let user2Id: string;

  let testCategory: any;
  let productWithVariant: any;
  let variantM: any;
  let variantS: any;
  let productNoVariant: any;

  beforeAll(async () => {
    // 1. Production Data Safety Check & Snapshot
    const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
    if (superAdminRole) {
      initialSuperAdminSnapshot = await prisma.user.findFirst({
        where: { roleId: superAdminRole.id, deletedAt: null },
      });
    }

    // Clean up ONLY test specific categories & products to avoid cluttering test DB
    await prisma.orderAddress.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.cartItem.deleteMany({});
    await prisma.cart.deleteMany({});
    await prisma.productVariant.deleteMany({
      where: { product: { name: { contains: 'OrderTest' } } },
    });
    await prisma.product.deleteMany({
      where: { name: { contains: 'OrderTest' } },
    });
    await prisma.category.deleteMany({
      where: { name: { contains: 'OrderTestCat' } },
    });

    // 2. Create isolated TEST ADMIN user
    const adminRole = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN', description: 'Admin Role' },
    });

    const userRole = await prisma.role.upsert({
      where: { name: 'USER' },
      update: {},
      create: { name: 'USER', description: 'Standard Customer Role' },
    });

    const testPasswordHash = await hashPassword('TestPassword@123');
    const timestamp = Date.now();

    testAdminUser = await prisma.user.create({
      data: {
        name: 'Order Test Admin',
        email: `ordertest_admin_${timestamp}@example.com`,
        mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
        passwordHash: testPasswordHash,
        roleId: adminRole.id,
        isVerified: true,
        isActive: true,
      },
    });
    const adminTokens = await issueTokens(testAdminUser.id, 'ADMIN');
    testAdminToken = adminTokens.accessToken;

    // 3. Create isolated TEST USER 1
    user1Email = `ordertest_u1_${timestamp}@example.com`;
    const u1 = await prisma.user.create({
      data: {
        name: 'Order Test User 1',
        email: user1Email,
        mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
        passwordHash: testPasswordHash,
        roleId: userRole.id,
        isVerified: true,
        isActive: true,
        address: '123 Initial User Address',
      },
    });
    user1Id = u1.id;
    const u1Tokens = await issueTokens(u1.id, 'USER');
    user1Token = u1Tokens.accessToken;

    // 4. Create isolated TEST USER 2
    const u2 = await prisma.user.create({
      data: {
        name: 'Order Test User 2',
        email: `ordertest_u2_${timestamp}@example.com`,
        mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
        passwordHash: testPasswordHash,
        roleId: userRole.id,
        isVerified: true,
        isActive: true,
      },
    });
    user2Id = u2.id;
    const u2Tokens = await issueTokens(u2.id, 'USER');
    user2Token = u2Tokens.accessToken;

    // 5. Seed Test Category & Products
    testCategory = await prisma.category.create({
      data: { name: `OrderTestCat_${timestamp}` },
    });

    productWithVariant = await prisma.product.create({
      data: {
        name: 'OrderTest Variant Shirt',
        categoryId: testCategory.id,
        color: 'Navy Blue',
        gst: 18,
        description: 'Cotton shirt with size variants',
        basePrice: 1500,
        sellPrice: 1200,
        stock: 15,
        variants: {
          create: [
            { size: 'M', stock: 10 },
            { size: 'S', stock: 5 },
          ],
        },
      },
      include: { variants: true },
    });

    variantM = productWithVariant.variants.find((v: any) => v.size === 'M');
    variantS = productWithVariant.variants.find((v: any) => v.size === 'S');

    productNoVariant = await prisma.product.create({
      data: {
        name: 'OrderTest Leather Belt',
        categoryId: testCategory.id,
        color: 'Brown',
        gst: 12,
        description: 'Genuine leather belt',
        basePrice: 800,
        sellPrice: 600,
        stock: 20,
      },
    });
  });

  afterAll(async () => {
    // Real Super Admin Safety Check
    if (initialSuperAdminSnapshot) {
      const currentSuperAdmin = await prisma.user.findUnique({
        where: { id: initialSuperAdminSnapshot.id },
      });
      expect(currentSuperAdmin).toBeDefined();
      expect(currentSuperAdmin?.email).toBe(initialSuperAdminSnapshot.email);
      expect(currentSuperAdmin?.roleId).toBe(initialSuperAdminSnapshot.roleId);
      expect(currentSuperAdmin?.passwordHash).toBe(initialSuperAdminSnapshot.passwordHash);
      expect(currentSuperAdmin?.isActive).toBe(initialSuperAdminSnapshot.isActive);
    }
    await prisma.$disconnect();
  });

  // ===================================================
  // GUEST CUSTOMER CHECKOUT & AUTO ACCOUNT CREATION
  // ===================================================
  describe('Guest Customer Checkout Flow', () => {
    let guestId: string;
    let placedOrder: any;

    it('1 & 2 & 3. Guest cart checkout creates order & returns proper response', async () => {
      // Step A: Add product to guest cart
      const cartRes = await request(app)
        .post('/api/v1/cart/items')
        .send({
          productId: productWithVariant.id,
          variantId: variantM.id,
          quantity: 2,
        });

      expect(cartRes.status).toBe(201);
      guestId = cartRes.headers['x-guest-id'];
      expect(guestId).toBeDefined();

      // Step B: Submit checkout as guest using new email & mobile
      const guestEmail = `guest_buyer_${Date.now()}@example.com`;
      const guestMobile = `9${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 10);
      const checkoutRes = await request(app)
        .post('/api/v1/orders')
        .set('X-Guest-ID', guestId)
        .send({
          name: 'Guest Buyer',
          mobileNumber: guestMobile,
          email: guestEmail,
          address: 'House No 45, Main Street',
          homeTown: 'Saharanpur',
          city: 'Saharanpur',
          state: 'Uttar Pradesh',
          pincode: '247001',
        });

      expect(checkoutRes.status).toBe(201);
      expect(checkoutRes.body.success).toBe(true);
      expect(checkoutRes.body.message).toBe('Order placed successfully');
      
      placedOrder = checkoutRes.body.data;
      expect(placedOrder.orderNumber).toMatch(/^LAM-\d{8}-[A-F0-9]{6}$/);
      expect(placedOrder.trackingToken).toBeDefined();
      expect(placedOrder.status).toBe('PENDING');
      expect(placedOrder.paymentStatus).toBe('PENDING');
      expect(placedOrder.items.length).toBe(1);
      expect(placedOrder.items[0].productName).toBe('OrderTest Variant Shirt');
      expect(placedOrder.items[0].quantity).toBe(2);
      expect(placedOrder.items[0].unitPrice).toBe(1200);
      expect(placedOrder.items[0].lineTotal).toBe(2400);
      expect(placedOrder.shippingAddress.city).toBe('Saharanpur');
      expect(placedOrder.shippingAddress.pincode).toBe('247001');
      expect(placedOrder.subtotal).toBe(2400);
      expect(placedOrder.totalAmount).toBe(2400);
    });

    it('4. Verify guest cart is cleared after checkout', async () => {
      const getCartRes = await request(app).get('/api/v1/cart').set('X-Guest-ID', guestId);
      expect(getCartRes.status).toBe(200);
      expect(getCartRes.body.data.cart.items.length).toBe(0);
    });

    it('5, 6 & 7. Automatic account creation and order linking for new guest', async () => {
      expect(placedOrder.customer.customerType).toBe('USER');
      expect(placedOrder.customer.userId).toBeDefined();

      const createdUser = await prisma.user.findUnique({
        where: { id: placedOrder.customer.userId },
        include: { role: true },
      });

      expect(createdUser).toBeDefined();
      expect(createdUser?.role.name).toBe('USER');
      expect(createdUser?.mustChangePassword).toBe(true);
    });

    it('8 & 9. Guest can track order via trackingToken', async () => {
      const trackRes = await request(app).get(`/api/v1/orders/guest/${placedOrder.trackingToken}`);
      expect(trackRes.status).toBe(200);
      expect(trackRes.body.success).toBe(true);
      expect(trackRes.body.data.orderNumber).toBe(placedOrder.orderNumber);
    });
  });

  // ===================================================
  // AUTHENTICATED CUSTOMER CHECKOUT FLOW
  // ===================================================
  describe('Authenticated Customer Checkout Flow', () => {
    let authOrder: any;

    it('10, 11, 12, 13. Add items to user cart, checkout & verify cart cleared', async () => {
      // Add Product 1 (variant S, qty 2)
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          productId: productWithVariant.id,
          variantId: variantS.id,
          quantity: 2,
        });

      // Add Product 2 (no variant, qty 3)
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          productId: productNoVariant.id,
          quantity: 3,
        });

      // Checkout
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Order Test User 1',
          mobileNumber: '9876543210',
          email: user1Email,
          address: '789 User1 Colony',
          homeTown: 'Noida',
          city: 'Noida',
          state: 'Uttar Pradesh',
          pincode: '201301',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      authOrder = res.body.data;

      expect(authOrder.items.length).toBe(2);
      expect(authOrder.subtotal).toBe(2 * 1200 + 3 * 600); // 2400 + 1800 = 4200
      expect(authOrder.customer.userId).toBe(user1Id);

      // Verify cart cleared
      const cartRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(cartRes.body.data.cart.items.length).toBe(0);
    });

    it('14. Retrieve user order list', async () => {
      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.orders.length).toBeGreaterThanOrEqual(1);
    });

    it('15. Retrieve single user order detail', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${authOrder.id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(authOrder.id);
    });

    it('16. User order cancellation (allowed statuses PENDING, CONFIRMED, PROCESSING)', async () => {
      const cancelRes = await request(app)
        .post(`/api/v1/orders/${authOrder.id}/cancel`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
    });

    it('17. User cannot access another user order (IDOR protection)', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${authOrder.id}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(404);
    });
  });

  // ===================================================
  // USER PROFILE & ADDRESS IMMUTABILITY
  // ===================================================
  describe('User Profile & Address Immutability', () => {
    let originalOrder: any;

    beforeAll(async () => {
      // Place an order for user 1
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          productId: productNoVariant.id,
          quantity: 1,
        });

      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Original Address Name',
          mobileNumber: '9876543210',
          email: user1Email,
          address: 'Original Flat 101, Old Sector',
          homeTown: 'Ghaziabad',
          city: 'Ghaziabad',
          state: 'Uttar Pradesh',
          pincode: '201001',
        });

      originalOrder = orderRes.body.data;
    });

    it('18. Get profile for authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(user1Email);
    });

    it('19, 20, 21, 22. Update user profile name, address, and gender', async () => {
      const updateRes = await request(app)
        .patch('/api/v1/profile')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Updated User1 Name',
          address: 'New Villa 999, New Tech City',
          gender: 'MALE',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.name).toBe('Updated User1 Name');
      expect(updateRes.body.data.address).toBe('New Villa 999, New Tech City');
      expect(updateRes.body.data.gender).toBe('MALE');
    });

    it('23. Verify old order shipping address snapshot remains completely unchanged', async () => {
      const getOrderRes = await request(app)
        .get(`/api/v1/orders/${originalOrder.id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(getOrderRes.status).toBe(200);
      expect(getOrderRes.body.data.shippingAddress.address).toBe('Original Flat 101, Old Sector');
      expect(getOrderRes.body.data.shippingAddress.name).toBe('Original Address Name');
    });

    it('24 & 25. Verify order address modification endpoint does NOT exist', async () => {
      const patchRes = await request(app)
        .patch(`/api/v1/orders/${originalOrder.id}/address`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ address: 'Hacked Address' });

      expect(patchRes.status).toBe(404);
    });
  });

  // ===================================================
  // STOCK SAFETY & VALIDATION
  // ===================================================
  describe('Stock Safety & Validation', () => {
    it('26 & 27. Order fails when cart quantity exceeds available stock', async () => {
      // Add product to cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          productId: productNoVariant.id,
          quantity: 2,
        });

      // Reduce product stock directly to 1 to simulate stock exhaustion
      await prisma.product.update({
        where: { id: productNoVariant.id },
        data: { stock: 1 },
      });

      const checkoutRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          name: 'User 2',
          mobileNumber: '9876543210',
          email: 'user2@example.com',
          address: 'Address 123',
          homeTown: 'City',
          city: 'City',
          state: 'State',
          pincode: '110001',
        });

      expect(checkoutRes.status).toBe(409);
      expect(checkoutRes.body.message).toContain('exceeds available stock');

      // Restore stock
      await prisma.product.update({
        where: { id: productNoVariant.id },
        data: { stock: 20 },
      });
      await prisma.cartItem.deleteMany({});
    });

    it('28 & 29. Verify variant and product stock decrement accurately after checkout', async () => {
      const initialVariantM = await prisma.productVariant.findUnique({ where: { id: variantM.id } });
      const initialProduct = await prisma.product.findUnique({ where: { id: productWithVariant.id } });

      const stockBeforeM = initialVariantM!.stock;
      const stockBeforeProd = initialProduct!.stock;

      // Add 2 of variantM to user 2 cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          productId: productWithVariant.id,
          variantId: variantM.id,
          quantity: 2,
        });

      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          name: 'User 2',
          mobileNumber: '9876543210',
          email: 'user2@example.com',
          address: 'Address 123',
          homeTown: 'City',
          city: 'City',
          state: 'State',
          pincode: '110001',
        });

      const finalVariantM = await prisma.productVariant.findUnique({ where: { id: variantM.id } });
      const finalProduct = await prisma.product.findUnique({ where: { id: productWithVariant.id } });

      expect(finalVariantM?.stock).toBe(stockBeforeM - 2);
      expect(finalProduct?.stock).toBe(stockBeforeProd - 2);
    });
  });

  // ===================================================
  // ADMIN ORDER MANAGEMENT
  // ===================================================
  describe('Admin Order Management', () => {
    let adminTestOrder: any;

    beforeAll(async () => {
      // Add product to cart first
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          productId: productNoVariant.id,
          quantity: 1,
        });

      const validOrderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Admin Target Customer',
          mobileNumber: '9876543210',
          email: 'admin_target@example.com',
          address: 'Admin Search House',
          homeTown: 'Delhi',
          city: 'New Delhi',
          state: 'Delhi',
          pincode: '110001',
        });

      adminTestOrder = validOrderRes.body.data;
    });

    it('31. Admin order list retrieval', async () => {
      const res = await request(app)
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${testAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.orders.length).toBeGreaterThanOrEqual(1);
    });

    it('32. Admin single order detail view', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/orders/${adminTestOrder.id}`)
        .set('Authorization', `Bearer ${testAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(adminTestOrder.id);
    });

    it('33. Admin search by order number and customer name', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/orders?search=${adminTestOrder.orderNumber}`)
        .set('Authorization', `Bearer ${testAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.orders.length).toBe(1);
      expect(res.body.data.orders[0].id).toBe(adminTestOrder.id);
    });

    it('34. Admin status update to CONFIRMED', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/orders/${adminTestOrder.id}/status`)
        .set('Authorization', `Bearer ${testAdminToken}`)
        .send({ status: 'CONFIRMED' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CONFIRMED');
    });

    it('35. Invalid status transition rejected (e.g. CONFIRMED to DELIVERED directly)', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/orders/${adminTestOrder.id}/status`)
        .set('Authorization', `Bearer ${testAdminToken}`)
        .send({ status: 'DELIVERED' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid status transition');
    });

    it('36. Admin order cancellation', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/orders/${adminTestOrder.id}/cancel`)
        .set('Authorization', `Bearer ${testAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });
  });

  // ===================================================
  // SECURITY & AUTHORIZATION SUITE
  // ===================================================
  describe('Security & Authorization Hardening', () => {
    it('37. Guest cannot access guest order without tracking token', async () => {
      const res = await request(app).get('/api/v1/orders/guest/invalid-token-12345');
      expect(res.status).toBe(404);
    });

    it('38. User cannot access another user order (404 / IDOR)', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(404);
    });

    it('39. User cannot directly modify order status via customer API', async () => {
      const patchRes = await request(app)
        .patch(`/api/v1/orders/${user1Id}/status`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ status: 'DELIVERED' });

      expect(patchRes.status).toBe(404);
    });

    it('41. User cannot modify role through profile update endpoint', async () => {
      const res = await request(app)
        .patch('/api/v1/profile')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ role: 'SUPER_ADMIN' });

      expect(res.status).toBe(200);

      const profileRes = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(profileRes.body.data.role).toBe('USER');
    });
  });
});
