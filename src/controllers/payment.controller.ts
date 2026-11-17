import { Request, Response, NextFunction } from 'express';
import { createRazorpayOrder, verifyPaymentSignature } from '../services/payment.service';
import { getRazorpayKeyId } from '../config/razorpay';
import { sendSuccess } from '../utils/response';

/**
 * Controller to create a Razorpay order
 * Endpoint: POST /api/create-order or /api/v1/payment/create-order
 */
export async function createOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await createRazorpayOrder(req.body);

    res.status(200).json({
      success: true,
      message: 'Razorpay order created successfully',
      order_id: result.order_id,
      amount: result.amount,
      currency: result.currency,
      key_id: result.key_id,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to verify Razorpay payment signature
 * Endpoint: POST /api/verify-payment or /api/v1/payment/verify-payment
 */
export async function verifyPaymentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await verifyPaymentSignature(req.body);

    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to retrieve Razorpay public Key ID for client checkout initialization
 * Endpoint: GET /api/v1/payment/key
 */
export async function getKeyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const keyId = getRazorpayKeyId();
    sendSuccess(res, 200, 'Razorpay key fetched successfully', { keyId });
  } catch (error) {
    next(error);
  }
}
