import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middleware/error.middleware';
import {
  createShipmentForOrder,
  checkCourierServiceability,
  assignCourierAwb,
  requestPickup,
  generateShippingLabel,
  generateManifest,
  trackShipment,
  cancelShipment,
  getCustomerTracking,
  handleTrackingWebhook,
} from '../services/shipping.service';

export async function createShipmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderId = (req.params.orderId || req.body.orderId) as string;
    if (!orderId) {
      throw new AppError('Order ID is required', 400);
    }

    const shipment = await createShipmentForOrder(orderId, req.body);
    sendSuccess(res, 201, 'Shiprocket shipment order created successfully', shipment);
  } catch (error) {
    next(error);
  }
}

export async function getServiceabilityHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const deliveryPostcode = req.query.delivery_postcode as string | undefined;
    const pickupPostcode = req.query.pickup_postcode as string | undefined;
    const weight = req.query.weight ? parseFloat(req.query.weight as string) : undefined;
    const cod = req.query.cod !== undefined ? parseInt(req.query.cod as string, 10) : undefined;
    const orderId = req.query.orderId as string | undefined;

    const result = await checkCourierServiceability({
      delivery_postcode: deliveryPostcode,
      pickup_postcode: pickupPostcode,
      weight,
      cod,
      orderId,
    });

    sendSuccess(res, 200, 'Courier serviceability fetched successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function assignCourierAwbHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderId = (req.params.orderId || req.body.orderId) as string;
    const courierId = req.body.courierId ? parseInt(req.body.courierId, 10) : undefined;

    if (!orderId) {
      throw new AppError('Order ID is required to assign AWB', 400);
    }

    const result = await assignCourierAwb(orderId, courierId);
    sendSuccess(res, 200, 'AWB assigned successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function generatePickupHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderId = (req.params.orderId || req.body.orderId) as string;
    if (!orderId) {
      throw new AppError('Order ID is required to request pickup', 400);
    }

    const result = await requestPickup(orderId);
    sendSuccess(res, 200, 'Pickup requested successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function generateLabelHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderId = (req.params.orderId || req.body.orderId) as string;
    if (!orderId) {
      throw new AppError('Order ID is required to generate shipping label', 400);
    }

    const result = await generateShippingLabel(orderId);
    sendSuccess(res, 200, 'Shipping label generated successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function generateManifestHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderId = (req.params.orderId || req.body.orderId) as string;
    if (!orderId) {
      throw new AppError('Order ID is required to generate manifest', 400);
    }

    const result = await generateManifest(orderId);
    sendSuccess(res, 200, 'Manifest generated successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function trackShipmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const awbCode = req.params.awbCode as string | undefined;
    const orderId = (req.params.orderId || req.query.orderId) as string | undefined;

    if (!awbCode && !orderId) {
      throw new AppError('AWB code or Order ID is required for tracking', 400);
    }

    const result = await trackShipment({ awbCode, orderId });
    sendSuccess(res, 200, 'Shipment tracking information retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function cancelShipmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orderId = (req.params.orderId || req.body.orderId) as string | undefined;
    const awbCode = req.body.awbCode as string | undefined;

    if (!orderId && !awbCode) {
      throw new AppError('Order ID or AWB code is required to cancel shipment', 400);
    }

    const result = await cancelShipment({ orderId, awbCode });
    sendSuccess(res, 200, 'Shipment cancelled successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function customerTrackOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const orderId = req.params.orderId as string;
    const result = await getCustomerTracking(orderId, false, req.user.id);
    sendSuccess(res, 200, 'Order tracking details retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function guestTrackOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const trackingToken = req.params.trackingToken as string;
    const result = await getCustomerTracking(trackingToken, true);
    sendSuccess(res, 200, 'Guest order tracking details retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function trackingWebhookHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await handleTrackingWebhook(req.body);
    sendSuccess(res, 200, 'Webhook processed successfully', result);
  } catch (error) {
    next(error);
  }
}
