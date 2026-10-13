import { Router } from 'express';
import {
  checkoutHandler,
  getUserOrdersHandler,
  getUserOrderByIdHandler,
  cancelUserOrderHandler,
  getGuestOrderHandler,
  getAdminOrdersHandler,
  getAdminOrderByIdHandler,
  updateAdminOrderStatusHandler,
  cancelAdminOrderHandler,
} from '../controllers/order.controller';
import { optionalAuth } from '../middleware/optionalAuth.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { checkoutSchema, updateOrderStatusSchema } from '../validators/order.validator';

export const customerOrderRouter = Router();

// Customer & Guest Order Endpoints
customerOrderRouter.post('/', optionalAuth, validateRequest(checkoutSchema), checkoutHandler);
customerOrderRouter.get('/', authenticate, getUserOrdersHandler);
customerOrderRouter.get('/guest/:trackingToken', getGuestOrderHandler);
customerOrderRouter.get('/:orderId', authenticate, getUserOrderByIdHandler);
customerOrderRouter.post('/:orderId/cancel', authenticate, cancelUserOrderHandler);

export const adminOrderRouter = Router();

// Admin Order Management Endpoints
adminOrderRouter.use(authenticate);
adminOrderRouter.use(authorizeRoles('SUPER_ADMIN', 'ADMIN'));

adminOrderRouter.get('/', getAdminOrdersHandler);
adminOrderRouter.get('/:orderId', getAdminOrderByIdHandler);
adminOrderRouter.patch('/:orderId/status', validateRequest(updateOrderStatusSchema), updateAdminOrderStatusHandler);
adminOrderRouter.post('/:orderId/cancel', cancelAdminOrderHandler);
