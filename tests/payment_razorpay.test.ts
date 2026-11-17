import request from 'supertest';
import crypto from 'crypto';
import app from '../src/app';
import { prisma } from '../src/config/database';
import { env } from '../src/config/env';

describe('Razorpay Payment Integration Suite', () => {
  const testKeySecret = env.RAZORPAY_KEY_SECRET || 'vtFy1KNAIWLrv5xVP5SDKb3B';

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Key Retrieval Endpoint (GET /api/v1/payment/key)', () => {
    it('should return the configured Razorpay public key ID', async () => {
      const res = await request(app).get('/api/v1/payment/key');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.keyId).toBeDefined();
      expect(res.body.data.keyId).toBe(env.RAZORPAY_KEY_ID);
    });
  });

  describe('Create Order Endpoints (POST /api/create-order & /api/v1/payment/create-order)', () => {
    it('should successfully create an order with valid amount via /api/create-order', async () => {
      const res = await request(app)
        .post('/api/create-order')
        .send({
          amount: 50000, // 500.00 INR (50000 paise)
          currency: 'INR',
          receipt: 'test_receipt_001',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.order_id).toBeDefined();
      expect(res.body.order_id).toMatch(/^order_/);
      expect(res.body.amount).toBe(50000);
      expect(res.body.currency).toBe('INR');
    }, 15000);

    it('should also work via /api/v1/payment/create-order', async () => {
      const res = await request(app)
        .post('/api/v1/payment/create-order')
        .send({
          amount: 25000,
          currency: 'INR',
          receipt: 'test_receipt_002',
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.order_id).toBeDefined();
      expect(res.body.amount).toBe(25000);
    }, 15000);

    it('should reject orders with amount less than 100 paise', async () => {
      const res = await request(app)
        .post('/api/create-order')
        .send({
          amount: 50, // Less than 100 paise
          currency: 'INR',
        });

      expect([400, 422]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it('should reject orders missing both amount and orderId', async () => {
      const res = await request(app)
        .post('/api/create-order')
        .send({});

      expect([400, 422]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Verify Payment Endpoints (POST /api/verify-payment & /api/v1/payment/verify-payment)', () => {
    it('should verify signature successfully when valid via /api/verify-payment', async () => {
      const orderId = 'order_test_987654';
      const paymentId = 'pay_test_123456';
      const expectedSignature = crypto
        .createHmac('sha256', testKeySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const res = await request(app)
        .post('/api/verify-payment')
        .send({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: expectedSignature,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verified).toBe(true);
      expect(res.body.data.order_id).toBe(orderId);
      expect(res.body.data.payment_id).toBe(paymentId);
    });

    it('should verify signature using camelCase fields or /api/v1/payment/verify-payment', async () => {
      const orderId = 'order_test_alt_001';
      const paymentId = 'pay_test_alt_002';
      const signature = crypto
        .createHmac('sha256', testKeySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const res = await request(app)
        .post('/api/v1/payment/verify-payment')
        .send({
          order_id: orderId,
          payment_id: paymentId,
          signature: signature,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verified).toBe(true);
    });

    it('should reject when signature is invalid (mismatch)', async () => {
      const orderId = 'order_test_fail';
      const paymentId = 'pay_test_fail';
      const invalidSignature = 'invalid_signature_hex_value_1234567890abcdef1234567890abcdef12345678';

      const res = await request(app)
        .post('/api/verify-payment')
        .send({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: invalidSignature,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/verify-payment')
        .send({
          razorpay_order_id: 'order_123',
          // missing payment_id and signature
        });

      expect([400, 422]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });
  });
});
