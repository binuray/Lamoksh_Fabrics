import { Router } from 'express';
import {
  createShipmentHandler,
  getServiceabilityHandler,
  assignCourierAwbHandler,
  generatePickupHandler,
  generateLabelHandler,
  generateManifestHandler,
  trackShipmentHandler,
  cancelShipmentHandler,
  customerTrackOrderHandler,
  guestTrackOrderHandler,
  trackingWebhookHandler,
} from '../controllers/shipping.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import {
  serviceabilityQuerySchema,
  createShipmentSchema,
  assignAwbSchema,
  generatePickupSchema,
  generateLabelSchema,
  generateManifestSchema,
  cancelShippingSchema,
} from '../validators/shipping.validator';

export const adminShippingRouter = Router();

// Secure admin shipping routes
adminShippingRouter.use(authenticate);
adminShippingRouter.use(authorizeRoles('SUPER_ADMIN', 'ADMIN'));

// 1. Create or retry shipment
adminShippingRouter.post('/orders/:orderId/create', validateRequest(createShipmentSchema), createShipmentHandler);
adminShippingRouter.post('/orders/:orderId/retry', validateRequest(createShipmentSchema), createShipmentHandler);

// 2. Courier serviceability check
adminShippingRouter.get('/serviceability', getServiceabilityHandler);

// 3. Assign AWB
adminShippingRouter.post('/courier/assign-awb', validateRequest(assignAwbSchema), assignCourierAwbHandler);
adminShippingRouter.post('/orders/:orderId/assign-awb', validateRequest(assignAwbSchema), assignCourierAwbHandler);

// 4. Request Pickup
adminShippingRouter.post('/courier/generate-pickup', validateRequest(generatePickupSchema), generatePickupHandler);
adminShippingRouter.post('/orders/:orderId/generate-pickup', validateRequest(generatePickupSchema), generatePickupHandler);

// 5. Generate Label
adminShippingRouter.post('/courier/generate-label', validateRequest(generateLabelSchema), generateLabelHandler);
adminShippingRouter.post('/orders/:orderId/generate-label', validateRequest(generateLabelSchema), generateLabelHandler);

// 6. Generate Manifest
adminShippingRouter.post('/manifests/generate', validateRequest(generateManifestSchema), generateManifestHandler);
adminShippingRouter.post('/orders/:orderId/generate-manifest', validateRequest(generateManifestSchema), generateManifestHandler);

// 7. Track Shipment
adminShippingRouter.get('/courier/track/awb/:awbCode', trackShipmentHandler);
adminShippingRouter.get('/orders/:orderId/track', trackShipmentHandler);
adminShippingRouter.post('/orders/:orderId/sync', trackShipmentHandler);

// 8. Cancel Shipment
adminShippingRouter.post('/orders/:orderId/cancel', validateRequest(cancelShippingSchema), cancelShipmentHandler);
adminShippingRouter.post('/orders/cancel', validateRequest(cancelShippingSchema), cancelShipmentHandler);

// Customer & Public Tracking Router
export const publicShippingRouter = Router();

// Customer tracking (Authenticated)
publicShippingRouter.get('/orders/:orderId/track', authenticate, customerTrackOrderHandler);

// Guest tracking (Public with tracking token)
publicShippingRouter.get('/orders/guest/:trackingToken/track', guestTrackOrderHandler);

// Webhook status synchronization
publicShippingRouter.post('/webhook', trackingWebhookHandler);
