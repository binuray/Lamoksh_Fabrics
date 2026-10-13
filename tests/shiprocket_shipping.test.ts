import request from 'supertest';
import crypto from 'crypto';
import app from '../src/app';
import { prisma } from '../src/config/database';
import { hashPassword } from '../src/utils/password';
import { issueTokens } from '../src/services/token.service';
import { shiprocketClient } from '../src/services/shiprocket.client';

jest.setTimeout(30000);

describe('Shiprocket Shipping Integration Test Suite', () => {
  let testAdminToken: string;
  let testCustomerToken: string;
  let otherCustomerToken: string;
  let testCustomerId: string;
  let otherCustomerId: string;
  let testCategory: any;
  let testProduct: any;

  let createdOrderId: string;
  let guestOrderId: string;
  let guestTrackingToken: string;

  let originalFetch: typeof global.fetch;

  beforeAll(async () => {
    originalFetch = global.fetch;

    // Ensure Roles exist
    const adminRole = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN', description: 'Admin Role' },
    });

    const userRole = await prisma.role.upsert({
      where: { name: 'USER' },
      update: {},
      create: { name: 'USER', description: 'Customer Role' },
    });

    const testPasswordHash = await hashPassword('TestShiprocket@123');
    const timestamp = Date.now();

    // 1. Create Test Admin
    const adminUser = await prisma.user.create({
      data: {
        name: 'Shiprocket Admin',
        email: `sr_admin_${timestamp}@example.com`,
        mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
        passwordHash: testPasswordHash,
        roleId: adminRole.id,
        isVerified: true,
        isActive: true,
      },
    });
    const adminTokens = await issueTokens(adminUser.id, 'ADMIN');
    testAdminToken = adminTokens.accessToken;

    // 2. Create Test Customer 1
    const customerUser = await prisma.user.create({
      data: {
        name: 'Shiprocket Customer 1',
        email: `sr_user_${timestamp}@example.com`,
        mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
        passwordHash: testPasswordHash,
        roleId: userRole.id,
        isVerified: true,
        isActive: true,
      },
    });
    testCustomerId = customerUser.id;
    const customerTokens = await issueTokens(customerUser.id, 'USER');
    testCustomerToken = customerTokens.accessToken;

    // 3. Create Other Customer (for IDOR check)
    const otherUser = await prisma.user.create({
      data: {
        name: 'Other Customer',
        email: `sr_other_${timestamp}@example.com`,
        mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`.substring(0, 15),
        passwordHash: testPasswordHash,
        roleId: userRole.id,
        isVerified: true,
        isActive: true,
      },
    });
    otherCustomerId = otherUser.id;
    const otherTokens = await issueTokens(otherUser.id, 'USER');
    otherCustomerToken = otherTokens.accessToken;

    // 4. Seed Category & Product
    testCategory = await prisma.category.create({
      data: { name: `ShipCat_${timestamp}` },
    });

    testProduct = await prisma.product.create({
      data: {
        name: 'Shiprocket Test Kurta',
        categoryId: testCategory.id,
        color: 'Indigo',
        gst: 12,
        description: 'Cotton embroidered kurta',
        basePrice: 1200,
        sellPrice: 999,
        stock: 100,
      },
    });
  });

  afterAll(async () => {
    global.fetch = originalFetch;

    // Clean test data
    await prisma.shipment.deleteMany({
      where: { order: { customerName: { contains: 'Shiprocket' } } },
    });
    await prisma.orderAddress.deleteMany({
      where: { order: { customerName: { contains: 'Shiprocket' } } },
    });
    await prisma.orderItem.deleteMany({
      where: { order: { customerName: { contains: 'Shiprocket' } } },
    });
    await prisma.order.deleteMany({
      where: { customerName: { contains: 'Shiprocket' } },
    });
    await prisma.cartItem.deleteMany({
      where: { product: { name: { contains: 'Shiprocket' } } },
    });
    await prisma.product.deleteMany({
      where: { name: { contains: 'Shiprocket' } },
    });
    await prisma.category.deleteMany({
      where: { name: { contains: 'ShipCat_' } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'sr_' } },
    });
  });

  beforeEach(() => {
    // Reset Shiprocket client token cache and set credentials for testing
    shiprocketClient.clearTokenCache();
    shiprocketClient.setCredentials('test@shiprocket.in', 'testpassword123');
  });

  // ==========================================
  // SECTION 1: AUTHENTICATION & TOKEN REUSE
  // ==========================================
  describe('1. Shiprocket Authentication & Token Management', () => {
    it('should authenticate using credentials and cache the token', async () => {
      let loginCalls = 0;

      global.fetch = jest.fn(async (url: any) => {
        if (String(url).includes('/auth/login')) {
          loginCalls++;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              token: 'mock_jwt_token_12345',
              first_name: 'Test',
              last_name: 'Shiprocket',
              email: 'test@shiprocket.in',
            }),
          } as any;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as any;
      });

      // First token call
      const token1 = await shiprocketClient.getToken();
      expect(token1).toBe('mock_jwt_token_12345');
      expect(loginCalls).toBe(1);

      // Second call should reuse cached token without logging in again
      const token2 = await shiprocketClient.getToken();
      expect(token2).toBe('mock_jwt_token_12345');
      expect(loginCalls).toBe(1); // Still 1, reused!
    });

    it('should handle token expiry (401 Unauthorized), re-authenticate, and retry the request', async () => {
      let loginCalls = 0;
      let serviceCalls = 0;

      global.fetch = jest.fn(async (url: any) => {
        if (String(url).includes('/auth/login')) {
          loginCalls++;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              token: `mock_jwt_token_call_${loginCalls}`,
            }),
          } as any;
        }

        if (String(url).includes('/courier/serviceability/')) {
          serviceCalls++;
          // First call fails with 401 Unauthorized
          if (serviceCalls === 1) {
            return {
              ok: false,
              status: 401,
              json: async () => ({ message: 'Token has expired' }),
            } as any;
          }

          // Retry call succeeds
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 200,
              data: { available_courier_companies: [{ courier_name: 'Delhivery Surface', id: 10 }] },
            }),
          } as any;
        }

        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      // Force an existing expired token
      shiprocketClient.setToken('old_expired_token', 100000);

      const result = await shiprocketClient.checkServiceability({
        delivery_postcode: '110001',
        pickup_postcode: '560001',
      });

      expect(result.data.available_courier_companies.length).toBeGreaterThan(0);
      expect(serviceCalls).toBe(2); // First failed with 401, second retried
      expect(loginCalls).toBe(1); // Re-authenticated
    });
  });

  // ==========================================
  // SECTION 2: ORDER CREATION & SHIPMENT FLOW
  // ==========================================
  describe('2. Order Mapping & Shipment Creation', () => {
    it('should support customer checkout and create order with initial shipment record', async () => {
      // Setup customer cart
      await prisma.cart.upsert({
        where: { userId: testCustomerId },
        update: {},
        create: { userId: testCustomerId },
      });
      const cart = await prisma.cart.findUnique({ where: { userId: testCustomerId } });
      await prisma.cartItem.create({
        data: {
          cartId: cart!.id,
          productId: testProduct.id,
          quantity: 2,
        },
      });

      const checkoutRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${testCustomerToken}`)
        .send({
          name: 'Shiprocket Customer One',
          mobileNumber: '9876543210',
          email: 'sr_customer@example.com',
          address: '42 MG Road, Indiranagar',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560038',
          paymentMethod: 'ONLINE',
        });

      expect(checkoutRes.status).toBe(201);
      expect(checkoutRes.body.data.id).toBeDefined();
      expect(checkoutRes.body.data.shipment).toBeDefined();
      expect(checkoutRes.body.data.shipment.status).toBe('PENDING');

      createdOrderId = checkoutRes.body.data.id;
    });

    it('should support guest checkout and create order with initial shipment record', async () => {
      const guestId = crypto.randomUUID();
      const guestCart = await prisma.cart.create({ data: { guestId } });
      await prisma.cartItem.create({
        data: {
          cartId: guestCart.id,
          productId: testProduct.id,
          quantity: 1,
        },
      });

      const checkoutRes = await request(app)
        .post('/api/v1/orders')
        .set('x-guest-id', guestId)
        .send({
          name: 'Shiprocket Guest Buyer',
          mobileNumber: '9123456780',
          email: 'guest_sr@example.com',
          address: '15 Park Street',
          city: 'Kolkata',
          state: 'West Bengal',
          pincode: '700016',
          paymentMethod: 'CASH_ON_DELIVERY',
        });

      expect(checkoutRes.status).toBe(201);
      expect(checkoutRes.body.data.id).toBeDefined();
      expect(checkoutRes.body.data.trackingToken).toBeDefined();
      expect(checkoutRes.body.data.shipment).toBeDefined();
      expect(checkoutRes.body.data.shipment.status).toBe('PENDING');

      guestOrderId = checkoutRes.body.data.id;
      guestTrackingToken = checkoutRes.body.data.trackingToken;
    });

    it('should create Shiprocket shipment and map order payload accurately', async () => {
      let interceptedPayload: any = null;

      global.fetch = jest.fn(async (url: any, options: any) => {
        if (String(url).includes('/auth/login')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ token: 'valid_mock_token' }),
          } as any;
        }

        if (String(url).includes('/orders/create/adhoc')) {
          interceptedPayload = JSON.parse(options.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              order_id: 2026101301,
              shipment_id: 88776655,
              status: 'NEW',
              response_code: 200,
            }),
          } as any;
        }

        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post(`/api/v1/admin/shipping/orders/${createdOrderId}/create`)
        .set('Authorization', `Bearer ${testAdminToken}`)
        .send({
          weight: 0.8,
          length: 12,
          breadth: 10,
          height: 8,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shiprocketOrderId).toBe('2026101301');
      expect(res.body.data.shiprocketShipmentId).toBe('88776655');
      expect(res.body.data.status).toBe('ORDER_CREATED');

      // Verify payload mapping
      expect(interceptedPayload).toBeDefined();
      expect(interceptedPayload.billing_customer_name).toBe('Shiprocket');
      expect(interceptedPayload.billing_city).toBe('Bengaluru');
      expect(interceptedPayload.billing_pincode).toBe('560038');
      expect(interceptedPayload.billing_state).toBe('Karnataka');
      expect(interceptedPayload.payment_method).toBe('Prepaid'); // ONLINE mapped to Prepaid
      expect(interceptedPayload.weight).toBe(0.8);
      expect(interceptedPayload.length).toBe(12);
      expect(interceptedPayload.order_items.length).toBe(1);
      expect(interceptedPayload.order_items[0].name).toBe('Shiprocket Test Kurta');
      expect(interceptedPayload.order_items[0].units).toBe(2);
    });

    it('should prevent duplicate shipment creation (idempotent)', async () => {
      let adhocCallCount = 0;

      global.fetch = jest.fn(async (url: any) => {
        if (String(url).includes('/auth/login')) {
          return { ok: true, status: 200, json: async () => ({ token: 'valid_mock_token' }) } as any;
        }
        if (String(url).includes('/orders/create/adhoc')) {
          adhocCallCount++;
          return {
            ok: true,
            status: 200,
            json: async () => ({ order_id: 9999999, shipment_id: 8888888 }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      // Call creation again on already created shipment
      const res = await request(app)
        .post(`/api/v1/admin/shipping/orders/${createdOrderId}/create`)
        .set('Authorization', `Bearer ${testAdminToken}`)
        .send();

      expect(res.status).toBe(201);
      expect(res.body.data.shiprocketOrderId).toBe('2026101301');
      expect(adhocCallCount).toBe(0); // Not called again! Idempotent!
    });

    it('should preserve local order and record status as FAILED when Shiprocket API fails', async () => {
      global.fetch = jest.fn(async (url: any) => {
        if (String(url).includes('/auth/login')) {
          return { ok: true, status: 200, json: async () => ({ token: 'mock_token' }) } as any;
        }
        if (String(url).includes('/orders/create/adhoc')) {
          return {
            ok: false,
            status: 422,
            json: async () => ({
              message: 'Invalid pickup location specified in Shiprocket settings',
              errors: { pickup_location: ['Location Primary does not exist'] },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post(`/api/v1/admin/shipping/orders/${guestOrderId}/create`)
        .set('Authorization', `Bearer ${testAdminToken}`)
        .send();

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);

      // Verify local order remains untouched in DB and shipment is marked FAILED
      const orderInDb = await prisma.order.findUnique({
        where: { id: guestOrderId },
        include: { shipment: true },
      });
      expect(orderInDb).toBeDefined();
      expect(orderInDb?.status).toBe('PENDING'); // Local order is preserved!
      expect(orderInDb?.shipment?.status).toBe('FAILED');
      expect(orderInDb?.shipment?.errorMessage).toContain('Invalid pickup location');
    });

    it('should provide a retry mechanism for failed shipment creation', async () => {
      global.fetch = jest.fn(async (url: any) => {
        if (String(url).includes('/auth/login')) {
          return { ok: true, status: 200, json: async () => ({ token: 'mock_token' }) } as any;
        }
        if (String(url).includes('/orders/create/adhoc')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              order_id: 2026101302,
              shipment_id: 88776656,
              status: 'NEW',
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const retryRes = await request(app)
        .post(`/api/v1/admin/shipping/orders/${guestOrderId}/retry`)
        .set('Authorization', `Bearer ${testAdminToken}`)
        .send({ weight: 0.5 });

      expect(retryRes.status).toBe(201);
      expect(retryRes.body.success).toBe(true);
      expect(retryRes.body.data.status).toBe('ORDER_CREATED');
      expect(retryRes.body.data.shiprocketOrderId).toBe('2026101302');
    });
  });

  // ==========================================
  // SECTION 3: SERVICEABILITY CHECK
  // ==========================================
  describe('3. Courier Serviceability Check', () => {
    it('should check serviceability with delivery postcode and return available couriers', async () => {
      global.fetch = jest.fn(async (url: any) => {
        if (String(url).includes('/auth/login')) {
          return { ok: true, status: 200, json: async () => ({ token: 'mock_token' }) } as any;
        }
        if (String(url).includes('/courier/serviceability/')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 200,
              data: {
                available_courier_companies: [
                  {
                    courier_company_id: 10,
                    courier_name: 'Delhivery Surface',
                    rate: 65.5,
                    cod: 1,
                    estimated_delivery_days: '3',
                  },
                  {
                    courier_company_id: 24,
                    courier_name: 'Blue Dart Air',
                    rate: 110.0,
                    cod: 1,
                    estimated_delivery_days: '2',
                  },
                ],
              },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .get('/api/v1/admin/shipping/serviceability?delivery_postcode=560038&weight=0.5&cod=1')
        .set('Authorization', `Bearer ${testAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.delivery_postcode).toBe('560038');
      expect(res.body.data.data.available_courier_companies.length).toBe(2);
      expect(res.body.data.data.available_courier_companies[0].courier_name).toBe('Delhivery Surface');
    });

    it('should reject invalid 5-digit delivery pincode', async () => {
      const res = await request(app)
        .get('/api/v1/admin/shipping/serviceability?delivery_postcode=12345')
        .set('Authorization', `Bearer ${testAdminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('valid 6-digit delivery pincode');
    });
  });

  // ==========================================
  // SECTION 4: AWB ASSIGNMENT, PICKUP, LABELS & MANIFEST
  // ==========================================
  describe('4. AWB Assignment, Pickup Request, Label & Manifest', () => {
    it('should assign AWB and courier partner to shipment', async () => {
      global.fetch = jest.fn(async (url: any) => {
        if (String(url).includes('/auth/login')) {
          return { ok: true, status: 200, json: async () => ({ token: 'mock_token' }) } as any;
        }
        if (String(url).includes('/courier/assign/awb')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              awb_assign_status: 1,
              response: {
                data: {
                  awb_code: 'AWB9876543210',
                  courier_name: 'Delhivery Surface',
                  courier_company_id: 10,
                  shipment_id: 88776655,
                },
              },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post(`/api/v1/admin/shipping/orders/${createdOrderId}/assign-awb`)
        .set('Authorization', `Bearer ${testAdminToken}`)
        .send({ courierId: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.awbCode).toBe('AWB9876543210');
      expect(res.body.data.courierName).toBe('Delhivery Surface');
      expect(res.body.data.status).toBe('AWB_ASSIGNED');
    });

    it('should generate pickup request and schedule pickup', async () => {
      global.fetch = jest.fn(async (url: any) => {
        if (String(url).includes('/auth/login')) {
          return { ok: true, status: 200, json: async () => ({ token: 'mock_token' }) } as any;
        }
        if (String(url).includes('/courier/generate/pickup')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              pickup_status: 1,
              response: {
                pickup_scheduled_date: '2026-10-14 11:00:00',
                pickup_token_number: 'PICKUP_TOKEN_123',
                status: 3,
              },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post(`/api/v1/admin/shipping/orders/${createdOrderId}/generate-pickup`)
        .set('Authorization', `Bearer ${testAdminToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shipment.pickupStatus).toBe('SCHEDULED');
      expect(res.body.data.shipment.pickupTokenNumber).toBe('PICKUP_TOKEN_123');
      expect(res.body.data.shipment.status).toBe('PICKUP_SCHEDULED');
    });

    it('should generate shipping label downloadable URL', async () => {
      global.fetch = jest.fn(async (url: any) => {
        if (String(url).includes('/auth/login')) {
          return { ok: true, status: 200, json: async () => ({ token: 'mock_token' }) } as any;
        }
        if (String(url).includes('/courier/generate/label')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 1,
              label_url: 'https://apiv2.shiprocket.in/uploads/shipping_labels/label_88776655.pdf',
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post(`/api/v1/admin/shipping/orders/${createdOrderId}/generate-label`)
        .set('Authorization', `Bearer ${testAdminToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.labelUrl).toContain('.pdf');
      expect(res.body.data.shipment.labelUrl).toContain('.pdf');
    });

    it('should generate manifest downloadable URL', async () => {
      global.fetch = jest.fn(async (url: any) => {
        if (String(url).includes('/auth/login')) {
          return { ok: true, status: 200, json: async () => ({ token: 'mock_token' }) } as any;
        }
        if (String(url).includes('/manifests/generate')) {
          return {
            ok: true,
            status: 1,
            json: async () => ({
              status: 1,
              manifest_url: 'https://apiv2.shiprocket.in/uploads/manifest/manifest_88776655.pdf',
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post(`/api/v1/admin/shipping/orders/${createdOrderId}/generate-manifest`)
        .set('Authorization', `Bearer ${testAdminToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.manifestUrl).toContain('.pdf');
      expect(res.body.data.shipment.manifestUrl).toContain('.pdf');
    });
  });

  // ==========================================
  // SECTION 5: TRACKING & STATUS SYNCHRONIZATION
  // ==========================================
  describe('5. Order Tracking & Status Synchronization', () => {
    it('should track shipment by AWB, update status to IN_TRANSIT, and update local order to SHIPPED', async () => {
      global.fetch = jest.fn(async (url: any) => {
        if (String(url).includes('/auth/login')) {
          return { ok: true, status: 200, json: async () => ({ token: 'mock_token' }) } as any;
        }
        if (String(url).includes('/courier/track/awb/')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              tracking_data: {
                track_status: 1,
                shipment_status_label: 'In Transit',
                awb_code: 'AWB9876543210',
                courier_name: 'Delhivery Surface',
                tracking_url: 'https://shiprocket.co/tracking/AWB9876543210',
                shipment_track_activities: [
                  {
                    date: '2026-10-14 12:00:00',
                    status: 'IN_TRANSIT',
                    activity: 'Package picked up by Delhivery',
                    location: 'Bangalore Hub',
                  },
                ],
              },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .get(`/api/v1/admin/shipping/courier/track/awb/AWB9876543210`)
        .set('Authorization', `Bearer ${testAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shipment.status).toBe('IN_TRANSIT');
      expect(res.body.data.shipment.trackingUrl).toBe('https://shiprocket.co/tracking/AWB9876543210');

      // Verify order status updated to SHIPPED
      const updatedOrder = await prisma.order.findUnique({ where: { id: createdOrderId } });
      expect(updatedOrder?.status).toBe('SHIPPED');
      expect(updatedOrder?.paymentStatus).toBe('PENDING'); // Payment status remains completely untouched!
    });

    it('should track shipment when DELIVERED and update local order to DELIVERED without overwriting payment status', async () => {
      global.fetch = jest.fn(async (url: any) => {
        if (String(url).includes('/auth/login')) {
          return { ok: true, status: 200, json: async () => ({ token: 'mock_token' }) } as any;
        }
        if (String(url).includes('/courier/track/awb/')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              tracking_data: {
                track_status: 1,
                shipment_status_label: 'Delivered',
                awb_code: 'AWB9876543210',
                courier_name: 'Delhivery Surface',
                tracking_url: 'https://shiprocket.co/tracking/AWB9876543210',
                shipment_track_activities: [
                  {
                    date: '2026-10-15 16:30:00',
                    status: 'DELIVERED',
                    activity: 'Package delivered to recipient',
                    location: 'Kolkata Hub',
                  },
                ],
              },
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post(`/api/v1/admin/shipping/orders/${createdOrderId}/sync`)
        .set('Authorization', `Bearer ${testAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.shipment.status).toBe('DELIVERED');

      // Verify local order updated to DELIVERED
      const deliveredOrder = await prisma.order.findUnique({ where: { id: createdOrderId } });
      expect(deliveredOrder?.status).toBe('DELIVERED');
      expect(deliveredOrder?.paymentStatus).toBe('PENDING'); // Never overwritten!
    });

    it('should allow customer to track their own order', async () => {
      const res = await request(app)
        .get(`/api/v1/shipping/orders/${createdOrderId}/track`)
        .set('Authorization', `Bearer ${testCustomerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe(createdOrderId);
      expect(res.body.data.shipment).toBeDefined();
    });

    it('should prevent user from tracking another users order (IDOR Protection)', async () => {
      const res = await request(app)
        .get(`/api/v1/shipping/orders/${createdOrderId}/track`)
        .set('Authorization', `Bearer ${otherCustomerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should allow guest to track order using trackingToken', async () => {
      const res = await request(app).get(`/api/v1/shipping/orders/guest/${guestTrackingToken}/track`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe(guestOrderId);
      expect(res.body.data.shipment).toBeDefined();
    });

    it('should process tracking webhook updates correctly', async () => {
      const res = await request(app)
        .post('/api/v1/shipping/webhook')
        .send({
          awb: 'AWB9876543210',
          current_status: 'DELIVERED',
          current_timestamp: '2026-10-15 16:30:00',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('success');
      expect(res.body.data.mappedStatus).toBe('DELIVERED');
    });
  });

  // ==========================================
  // SECTION 6: SHIPMENT CANCELLATION
  // ==========================================
  describe('6. Shipment Cancellation', () => {
    it('should cancel active shipment via Shiprocket', async () => {
      let cancelCalled = false;

      global.fetch = jest.fn(async (url: any) => {
        if (String(url).includes('/auth/login')) {
          return { ok: true, status: 200, json: async () => ({ token: 'mock_token' }) } as any;
        }
        if (String(url).includes('/orders/cancel')) {
          cancelCalled = true;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 200,
              message: 'Order cancelled successfully',
            }),
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({}) } as any;
      });

      const res = await request(app)
        .post(`/api/v1/admin/shipping/orders/${guestOrderId}/cancel`)
        .set('Authorization', `Bearer ${testAdminToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');
      expect(cancelCalled).toBe(true);

      const dbShipment = await prisma.shipment.findUnique({ where: { orderId: guestOrderId } });
      expect(dbShipment?.status).toBe('CANCELLED');
    });
  });

  // ==========================================
  // SECTION 7: SECURITY & AUTHORIZATION
  // ==========================================
  describe('7. Security & Admin Authorization', () => {
    it('should reject unauthenticated access to admin shipping endpoints', async () => {
      const res = await request(app).get('/api/v1/admin/shipping/serviceability');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject regular customer access to admin shipping endpoints (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/shipping/serviceability')
        .set('Authorization', `Bearer ${testCustomerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
