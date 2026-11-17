import crypto from 'crypto';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { getRazorpayInstance, getRazorpayKeySecret, getRazorpayKeyId } from '../config/razorpay';
import { OrderStatus, PaymentStatus, PaymentMethod } from '@prisma/client';
import { logger } from '../utils/logger';

export interface CreateRazorpayOrderParams {
  amount?: number; // In paise
  currency?: string;
  receipt?: string;
  notes?: Record<string, any>;
  orderId?: string; // Optional internal DB order ID or orderNumber
}

export interface VerifyRazorpayPaymentParams {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  orderId?: string; // Optional internal DB order ID or orderNumber
}

export interface RazorpayOrderResult {
  order_id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status?: string;
  key_id?: string;
  notes?: Record<string, any>;
}

export interface VerifyPaymentResult {
  verified: boolean;
  order_id: string;
  payment_id: string;
  internalOrderId?: string;
  message: string;
}

/**
 * Creates a Razorpay order via Razorpay API.
 * Validates amount >= 100 paise.
 * If an internal orderId is provided, extracts amount and metadata from DB if amount is omitted.
 */
export async function createRazorpayOrder(params: CreateRazorpayOrderParams): Promise<RazorpayOrderResult> {
  let { amount, currency = 'INR', receipt, notes = {}, orderId } = params;

  // If internal DB order ID provided, look up order to verify / default amount
  if (orderId) {
    try {
      const dbOrder = await prisma.order.findFirst({
        where: {
          OR: [{ id: orderId }, { orderNumber: orderId }],
        },
      });

      if (dbOrder) {
        if (!amount) {
          // Convert database totalAmount (INR) to paise
          amount = Math.round(Number(dbOrder.totalAmount) * 100);
        }
        if (!receipt) {
          receipt = dbOrder.orderNumber.slice(0, 40);
        }
        notes = {
          ...notes,
          internalOrderId: dbOrder.id,
          orderNumber: dbOrder.orderNumber,
        };
      }
    } catch (dbErr: any) {
      logger.warn({ err: dbErr, orderId }, 'Failed to look up internal order, continuing with raw params');
    }
  }

  // Minimum amount validation: 100 paise (₹1)
  if (amount === undefined || amount === null || isNaN(amount)) {
    throw new AppError('Amount is required (in paise)', 400);
  }

  const numericAmount = Math.round(Number(amount));
  if (numericAmount < 100) {
    throw new AppError('Amount must be at least 100 paise (₹1)', 400);
  }

  const receiptId = (receipt || `rcpt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`).slice(0, 40);

  try {
    const razorpay = getRazorpayInstance();
    const orderOptions = {
      amount: numericAmount,
      currency: currency.toUpperCase(),
      receipt: receiptId,
      notes,
    };

    const razorpayOrder = await razorpay.orders.create(orderOptions);

    return {
      order_id: razorpayOrder.id,
      amount: Number(razorpayOrder.amount),
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt,
      status: razorpayOrder.status,
      key_id: getRazorpayKeyId(),
      notes: razorpayOrder.notes as Record<string, any> | undefined,
    };
  } catch (error: any) {
    logger.error({ error, params }, 'Error creating Razorpay order');

    // Handle authentication failures
    if (error.statusCode === 401 || error.error?.code === 'BAD_REQUEST_ERROR' && error.error?.description?.includes('Authentication')) {
      throw new AppError('Razorpay authentication failure. Verify RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.', 401);
    }

    // Handle other Razorpay API errors (return 500)
    const message = error.error?.description || error.description || error.message || 'Failed to create Razorpay order';
    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    throw new AppError(message, statusCode);
  }
}

/**
 * Verifies Razorpay payment signature using HMAC-SHA256 algorithm.
 * If signature matches and an orderId is provided, updates DB order payment status to PAID.
 */
export async function verifyPaymentSignature(params: VerifyRazorpayPaymentParams): Promise<VerifyPaymentResult> {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = params;

  // Validate required fields
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new AppError(
      'Missing required payment verification fields (razorpay_order_id, razorpay_payment_id, razorpay_signature)',
      400
    );
  }

  const keySecret = getRazorpayKeySecret();
  const payload = `${razorpay_order_id}|${razorpay_payment_id}`;

  const generatedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(payload)
    .digest('hex');

  const generatedBuffer = Buffer.from(generatedSignature, 'utf-8');
  const receivedBuffer = Buffer.from(razorpay_signature, 'utf-8');

  const isMatch =
    generatedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(generatedBuffer, receivedBuffer);

  if (!isMatch) {
    logger.warn(
      { razorpay_order_id, razorpay_payment_id },
      'Razorpay payment signature mismatch detected'
    );
    throw new AppError('Payment signature verification failed. Invalid signature.', 400);
  }

  let matchedInternalOrderId: string | undefined;

  // If internal order reference provided, mark order as PAID and CONFIRMED
  if (orderId) {
    try {
      const order = await prisma.order.findFirst({
        where: {
          OR: [{ id: orderId }, { orderNumber: orderId }, { trackingToken: orderId }],
        },
      });

      if (order) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: PaymentStatus.PAID,
            status: OrderStatus.CONFIRMED,
            paymentMethod: PaymentMethod.ONLINE,
          },
        });
        matchedInternalOrderId = order.id;
        logger.info({ orderId: order.id, paymentId: razorpay_payment_id }, 'Order payment verified and marked as PAID');
      }
    } catch (err: any) {
      logger.error({ err, orderId }, 'Failed to update order status upon payment verification');
    }
  }

  return {
    verified: true,
    order_id: razorpay_order_id,
    payment_id: razorpay_payment_id,
    internalOrderId: matchedInternalOrderId,
    message: 'Payment verified successfully',
  };
}
