import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middleware/error.middleware';
import {
  createOrder,
  getUserOrders,
  getUserOrderById,
  cancelUserOrder,
  getGuestOrder,
  getAdminOrders,
  getAdminOrderById,
  updateAdminOrderStatus,
  cancelAdminOrder,
} from '../services/order.service';
import { OrderStatus, PaymentStatus } from '@prisma/client';

export async function checkoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const owner = {
      userId: req.user?.id,
      guestId: req.guestId,
    };

    const orderData = await createOrder(owner, req.body);
    sendSuccess(res, 201, 'Order placed successfully', orderData);
  } catch (error) {
    next(error);
  }
}

export async function getUserOrdersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    const result = await getUserOrders(req.user.id, page, limit);
    sendSuccess(res, 200, 'Orders retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function getUserOrderByIdHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const orderId = req.params.orderId as string;
    const orderData = await getUserOrderById(req.user.id, orderId);
    sendSuccess(res, 200, 'Order details retrieved successfully', orderData);
  } catch (error) {
    next(error);
  }
}

export async function cancelUserOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const orderId = req.params.orderId as string;
    const orderData = await cancelUserOrder(req.user.id, orderId);
    sendSuccess(res, 200, 'Order cancelled successfully', orderData);
  } catch (error) {
    next(error);
  }
}

export async function getGuestOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const trackingToken = req.params.trackingToken as string;
    const orderData = await getGuestOrder(trackingToken);
    sendSuccess(res, 200, 'Guest order retrieved successfully', orderData);
  } catch (error) {
    next(error);
  }
}

export async function getAdminOrdersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const search = req.query.search as string | undefined;
    const status = req.query.status as OrderStatus | undefined;
    const paymentStatus = req.query.paymentStatus as PaymentStatus | undefined;
    const sortBy = req.query.sortBy === 'oldest' ? 'oldest' : 'newest';

    const result = await getAdminOrders({
      page,
      limit,
      search,
      status,
      paymentStatus,
      sortBy,
    });

    sendSuccess(res, 200, 'Admin orders retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function getAdminOrderByIdHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderId = req.params.orderId as string;
    const orderData = await getAdminOrderById(orderId);
    sendSuccess(res, 200, 'Admin order details retrieved successfully', orderData);
  } catch (error) {
    next(error);
  }
}

export async function updateAdminOrderStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderId = req.params.orderId as string;
    const orderData = await updateAdminOrderStatus(orderId, req.body);
    sendSuccess(res, 200, 'Order status updated successfully', orderData);
  } catch (error) {
    next(error);
  }
}

export async function cancelAdminOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderId = req.params.orderId as string;
    const orderData = await cancelAdminOrder(orderId);
    sendSuccess(res, 200, 'Order cancelled by admin successfully', orderData);
  } catch (error) {
    next(error);
  }
}
