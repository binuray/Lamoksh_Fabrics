import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/database';
import { hashPassword } from '../src/utils/password';
import { issueTokens } from '../src/services/token.service';

describe('Cart & Wishlist Module Test Suite', () => {
  let superAdminToken: string;
  let user1Token: string;
  let user1Id: string;
  let user2Token: string;
  let user2Id: string;

  let testCategory: any;
  let productWithVariant: any;
  let variantM: any;
  let variantS: any;
  let productNoVariant: any;

  beforeAll(async () => {
    // Clean up test data
    await prisma.cartItem.deleteMany({});
    await prisma.cart.deleteMany({});
    await prisma.wishlistItem.deleteMany({});
    await prisma.wishlist.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.productMedia.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({ where: { name: { contains: 'CartTestCat' } } });

    // Seed Super Admin Role & User
    const superAdminRole = await prisma.role.upsert({
      where: { name: 'SUPER_ADMIN' },
      update: {},
      create: { name: 'SUPER_ADMIN', description: 'Super Admin Role' },
    });

    let superAdmin = await prisma.user.findFirst({
      where: { roleId: superAdminRole.id, deletedAt: null },
    });

    if (!superAdmin) {
      const passwordHash = await hashPassword('TestPassword@123');
      superAdmin = await prisma.user.create({
        data: {
          name: 'Cart Super Admin',
          email: `cart_admin_${Date.now()}@example.com`,
          mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
          passwordHash,
          roleId: superAdminRole.id,
          isVerified: true,
          isActive: true,
        },
      });
    }

    const superAdminTokens = await issueTokens(superAdmin.id, 'SUPER_ADMIN');
    superAdminToken = superAdminTokens.accessToken;

    // Seed User Role & 2 Test Users
    const userRole = await prisma.role.upsert({
      where: { name: 'USER' },
      update: {},
      create: { name: 'USER', description: 'User Role' },
    });

    const passwordHash = await hashPassword('TestPassword@123');

    const u1 = await prisma.user.create({
      data: {
        name: 'Cart Test User 1',
        email: `cart_user1_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`,
        mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
        passwordHash,
        roleId: userRole.id,
        isVerified: true,
        isActive: true,
      },
    });
    user1Id = u1.id;
    const u1Tokens = await issueTokens(u1.id, 'USER');
    user1Token = u1Tokens.accessToken;

    const u2 = await prisma.user.create({
      data: {
        name: 'Cart Test User 2',
        email: `cart_user2_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`,
        mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
        passwordHash,
        roleId: userRole.id,
        isVerified: true,
        isActive: true,
      },
    });
    user2Id = u2.id;
    const u2Tokens = await issueTokens(u2.id, 'USER');
    user2Token = u2Tokens.accessToken;

    // Create Category
    testCategory = await prisma.category.create({
      data: { name: `CartTestCat_${Date.now()}` },
    });

    // Create Product 1 (with variants M stock 10, S stock 5)
    productWithVariant = await prisma.product.create({
      data: {
        name: 'Variant Saree',
        categoryId: testCategory.id,
        color: 'Red',
        gst: 18,
        description: 'Silk saree with variants',
        basePrice: 2000,
        sellPrice: 1500,
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

    // Create Product 2 (without variants, stock 20)
    productNoVariant = await prisma.product.create({
      data: {
        name: 'No Variant Shawl',
        categoryId: testCategory.id,
        color: 'Blue',
        gst: 12,
        description: 'Pashmina shawl',
        basePrice: 1000,
        sellPrice: 800,
        stock: 20,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ==========================================
  // 1. GUEST CART TESTS
  // ==========================================
  describe('Guest Cart Flow', () => {
    let guestId: string;
    let addedItemId: string;

    it('should initialize guest session and add product to cart', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .send({
          productId: productWithVariant.id,
          variantId: variantM.id,
          quantity: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.headers['x-guest-id']).toBeDefined();

      guestId = res.headers['x-guest-id'];
      expect(res.body.data.cart.items.length).toBe(1);
      expect(res.body.data.cart.items[0].quantity).toBe(2);
      expect(res.body.data.cart.items[0].subtotal).toBe(3000); // 1500 * 2
      expect(res.body.data.cart.totalItems).toBe(2);
      expect(res.body.data.cart.subtotal).toBe(3000);

      addedItemId = res.body.data.cart.items[0].id;
    });

    it('should retrieve guest cart using X-Guest-ID header', async () => {
      const res = await request(app)
        .get('/api/v1/cart')
        .set('X-Guest-ID', guestId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cart.items.length).toBe(1);
      expect(res.body.data.cart.subtotal).toBe(3000);
    });

    it('should increment quantity when adding duplicate product + variant', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('X-Guest-ID', guestId)
        .send({
          productId: productWithVariant.id,
          variantId: variantM.id,
          quantity: 3,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.cart.items.length).toBe(1);
      expect(res.body.data.cart.items[0].quantity).toBe(5); // 2 + 3
      expect(res.body.data.cart.subtotal).toBe(7500); // 1500 * 5
    });

    it('should update guest cart item quantity', async () => {
      const res = await request(app)
        .put(`/api/v1/cart/items/${addedItemId}`)
        .set('X-Guest-ID', guestId)
        .send({ quantity: 4 });

      expect(res.status).toBe(200);
      expect(res.body.data.cart.items[0].quantity).toBe(4);
      expect(res.body.data.cart.subtotal).toBe(6000); // 1500 * 4
    });

    it('should check if item is in cart', async () => {
      const res = await request(app)
        .get(`/api/v1/cart/check?productId=${productWithVariant.id}&variantId=${variantM.id}`)
        .set('X-Guest-ID', guestId);

      expect(res.status).toBe(200);
      expect(res.body.data.inCart).toBe(true);
      expect(res.body.data.quantity).toBe(4);
    });

    it('should remove item from guest cart', async () => {
      const res = await request(app)
        .delete(`/api/v1/cart/items/${addedItemId}`)
        .set('X-Guest-ID', guestId);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Cart item removed successfully');

      const getRes = await request(app).get('/api/v1/cart').set('X-Guest-ID', guestId);
      expect(getRes.body.data.cart.items.length).toBe(0);
    });

    it('should clear guest cart', async () => {
      // Add non-variant product to cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('X-Guest-ID', guestId)
        .send({
          productId: productNoVariant.id,
          quantity: 2,
        });

      const clearRes = await request(app).delete('/api/v1/cart').set('X-Guest-ID', guestId);
      expect(clearRes.status).toBe(200);
      expect(clearRes.body.message).toBe('Cart cleared successfully');

      const getRes = await request(app).get('/api/v1/cart').set('X-Guest-ID', guestId);
      expect(getRes.body.data.cart.items.length).toBe(0);
    });
  });

  // ==========================================
  // 2. CART VALIDATION & ERROR HANDLING
  // ==========================================
  describe('Cart Validations', () => {
    it('should reject non-existent productId', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .send({
          productId: '00000000-0000-0000-0000-000000000000',
          quantity: 1,
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should reject missing variantId for product requiring variants', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .send({
          productId: productWithVariant.id,
          quantity: 1,
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toContain('Variant ID is required');
    });

    it('should reject variantId belonging to another product', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .send({
          productId: productNoVariant.id,
          variantId: variantM.id,
          quantity: 1,
        });

      expect(res.status).toBe(422);
    });

    it('should reject quantity = 0 or negative quantity', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .send({
          productId: productNoVariant.id,
          quantity: 0,
        });

      expect(res.status).toBe(422);
    });

    it('should reject quantity exceeding available stock', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .send({
          productId: productWithVariant.id,
          variantId: variantS.id, // stock = 5
          quantity: 10,
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toBe('Requested quantity exceeds available stock');
    });

    it('should reject invalid Bearer auth token (401)', async () => {
      const res = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', 'Bearer invalid-token-string');

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid or expired authentication token');
    });
  });

  // ==========================================
  // 3. AUTHENTICATED CART TESTS
  // ==========================================
  describe('Authenticated Cart Flow & Ownership Security', () => {
    let u1ItemId: string;

    it('should allow user1 to add product to cart', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          productId: productNoVariant.id,
          quantity: 3,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.cart.items.length).toBe(1);
      expect(res.body.data.cart.items[0].subtotal).toBe(2400); // 800 * 3
      u1ItemId = res.body.data.cart.items[0].id;
    });

    it('should prevent user2 from updating user1 cart item (ownership security)', async () => {
      const res = await request(app)
        .put(`/api/v1/cart/items/${u1ItemId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ quantity: 5 });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('unauthorized');
    });

    it('should prevent user2 from deleting user1 cart item (ownership security)', async () => {
      const res = await request(app)
        .delete(`/api/v1/cart/items/${u1ItemId}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('unauthorized');
    });

    it('should allow user1 to clear their cart', async () => {
      const res = await request(app)
        .delete('/api/v1/cart')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);

      const getRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(getRes.body.data.cart.items.length).toBe(0);
    });
  });

  // ==========================================
  // 4. GUEST & AUTHENTICATED WISHLIST TESTS
  // ==========================================
  describe('Wishlist Module Flow', () => {
    let guestId: string;
    let guestItemId: string;
    let user1WishlistItemId: string;

    it('should add product to guest wishlist', async () => {
      const res = await request(app)
        .post('/api/v1/wishlist/items')
        .send({ productId: productWithVariant.id });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.headers['x-guest-id']).toBeDefined();

      guestId = res.headers['x-guest-id'];
      guestItemId = res.body.data.item.id;
    });

    it('should handle idempotent add duplicate product to wishlist', async () => {
      const res = await request(app)
        .post('/api/v1/wishlist/items')
        .set('X-Guest-ID', guestId)
        .send({ productId: productWithVariant.id });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Product is already in wishlist');
    });

    it('should retrieve guest wishlist', async () => {
      const res = await request(app)
        .get('/api/v1/wishlist')
        .set('X-Guest-ID', guestId);

      expect(res.status).toBe(200);
      expect(res.body.data.wishlist.items.length).toBe(1);
      expect(res.body.data.wishlist.items[0].product.name).toBe('Variant Saree');
    });

    it('should check wishlist status for product', async () => {
      const res = await request(app)
        .get(`/api/v1/wishlist/check/${productWithVariant.id}`)
        .set('X-Guest-ID', guestId);

      expect(res.status).toBe(200);
      expect(res.body.data.isWishlisted).toBe(true);

      const res2 = await request(app)
        .get(`/api/v1/wishlist/check/${productNoVariant.id}`)
        .set('X-Guest-ID', guestId);

      expect(res2.body.data.isWishlisted).toBe(false);
    });

    it('should remove item from guest wishlist', async () => {
      const res = await request(app)
        .delete(`/api/v1/wishlist/items/${guestItemId}`)
        .set('X-Guest-ID', guestId);

      expect(res.status).toBe(200);

      const getRes = await request(app).get('/api/v1/wishlist').set('X-Guest-ID', guestId);
      expect(getRes.body.data.wishlist.items.length).toBe(0);
    });

    it('should allow user1 to add and retrieve wishlist items', async () => {
      const res = await request(app)
        .post('/api/v1/wishlist/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ productId: productNoVariant.id });

      expect(res.status).toBe(201);
      user1WishlistItemId = res.body.data.item.id;

      const getRes = await request(app)
        .get('/api/v1/wishlist')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(getRes.body.data.wishlist.items.length).toBe(1);
    });

    it('should prevent user2 from removing user1 wishlist item', async () => {
      const res = await request(app)
        .delete(`/api/v1/wishlist/items/${user1WishlistItemId}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('unauthorized');
    });
  });

  // ==========================================
  // 5. GUEST TO USER MERGE TESTS
  // ==========================================
  describe('Guest to User Cart & Wishlist Merge', () => {
    let mergeGuestId: string;

    it('should setup guest cart and wishlist before login merge', async () => {
      // Guest adds ProductWithVariant (variantM, qty 3)
      const cartRes = await request(app)
        .post('/api/v1/cart/items')
        .send({
          productId: productWithVariant.id,
          variantId: variantM.id,
          quantity: 3,
        });

      mergeGuestId = cartRes.headers['x-guest-id'];

      // Guest adds ProductNoVariant (qty 2)
      await request(app)
        .post('/api/v1/cart/items')
        .set('X-Guest-ID', mergeGuestId)
        .send({
          productId: productNoVariant.id,
          quantity: 2,
        });

      // Guest adds ProductNoVariant to wishlist
      await request(app)
        .post('/api/v1/wishlist/items')
        .set('X-Guest-ID', mergeGuestId)
        .send({ productId: productNoVariant.id });
    });

    it('should merge guest cart into user2 cart upon login', async () => {
      // User2 already has ProductWithVariant (variantM, qty 6)
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          productId: productWithVariant.id,
          variantId: variantM.id,
          quantity: 6,
        });

      // Call merge API (variantM stock = 10; user2 has 6, guest has 3 -> total 9 <= 10)
      const mergeRes = await request(app)
        .post('/api/v1/cart/merge')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ guestId: mergeGuestId });

      expect(mergeRes.status).toBe(200);
      expect(mergeRes.body.success).toBe(true);
      expect(mergeRes.body.data.merged).toBe(true);
      expect(mergeRes.body.data.cart.items.length).toBe(2);

      const mergedItemM = mergeRes.body.data.cart.items.find(
        (i: any) => i.productId === productWithVariant.id
      );
      expect(mergedItemM.quantity).toBe(9); // 6 + 3

      // Verify guest cart has been deleted/expired
      const guestCartRes = await request(app).get('/api/v1/cart').set('X-Guest-ID', mergeGuestId);
      expect(guestCartRes.body.data.cart.items.length).toBe(0);
    });

    it('should merge guest wishlist into user2 wishlist cleanly', async () => {
      const mergeRes = await request(app)
        .post('/api/v1/wishlist/merge')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ guestId: mergeGuestId });

      expect(mergeRes.status).toBe(200);
      expect(mergeRes.body.success).toBe(true);
      expect(mergeRes.body.data.merged).toBe(true);
      expect(mergeRes.body.data.wishlist.items.length).toBeGreaterThanOrEqual(1);

      // Verify guest wishlist has been cleared
      const guestWishlistRes = await request(app)
        .get('/api/v1/wishlist')
        
        .set('X-Guest-ID', mergeGuestId);
      expect(guestWishlistRes.body.data.wishlist.items.length).toBe(0);
    });

    it('should handle stock cap adjustment during cart merge', async () => {
      // Create fresh guest with 5 of variantS (variantS stock = 5)
      const gRes = await request(app)
        .post('/api/v1/cart/items')
        .send({
          productId: productWithVariant.id,
          variantId: variantS.id,
          quantity: 4,
        });

      const overflowGuestId = gRes.headers['x-guest-id'];

      // User1 adds 3 of variantS
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          productId: productWithVariant.id,
          variantId: variantS.id,
          quantity: 3,
        });

      // Merge (user1 has 3 + guest has 4 = 7, but stock is 5 -> capped at 5)
      const mergeRes = await request(app)
        .post('/api/v1/cart/merge')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ guestId: overflowGuestId });

      expect(mergeRes.status).toBe(200);
      expect(mergeRes.body.data.adjustedItems.length).toBe(1);
      expect(mergeRes.body.data.adjustedItems[0].mergedQuantity).toBe(5);

      const itemS = mergeRes.body.data.cart.items.find(
        (i: any) => i.variantId === variantS.id
      );
      expect(itemS.quantity).toBe(5);
    });
  });
});
