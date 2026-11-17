import { Router } from 'express';
import {
  createOrderHandler,
  verifyPaymentHandler,
  getKeyHandler,
} from '../controllers/payment.controller';
import { validateRequest } from '../middleware/validation.middleware';
import {
  createRazorpayOrderSchema,
  verifyRazorpayPaymentSchema,
} from '../validators/payment.validator';

const paymentRouter = Router();

// Retrieve Razorpay public key ID
paymentRouter.get('/key', getKeyHandler);

// Create Razorpay Order
paymentRouter.post(
  '/create-order',
  validateRequest(createRazorpayOrderSchema),
  createOrderHandler
);

// Verify Razorpay Payment Signature
paymentRouter.post(
  '/verify-payment',
  validateRequest(verifyRazorpayPaymentSchema),
  verifyPaymentHandler
);

// Verify payment alias (common endpoint variation)
paymentRouter.post(
  '/verify',
  validateRequest(verifyRazorpayPaymentSchema),
  verifyPaymentHandler
);

export default paymentRouter;
