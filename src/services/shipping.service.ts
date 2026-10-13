import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { shiprocketClient, ShiprocketAdhocOrderPayload } from './shiprocket.client';
import { ShipmentStatus, OrderStatus } from '@prisma/client';

export interface CreateShipmentOptions {
  weight?: number;
  length?: number;
  breadth?: number;
  height?: number;
  pickupLocation?: string;
}

export function formatShipmentResponse(shipment: any) {
  if (!shipment) return null;

  return {
    id: shipment.id,
    orderId: shipment.orderId,
    shiprocketOrderId: shipment.shiprocketOrderId || null,
    shiprocketShipmentId: shipment.shiprocketShipmentId || null,
    awbCode: shipment.awbCode || null,
    courierName: shipment.courierName || null,
    courierId: shipment.courierId || null,
    status: shipment.status,
    trackingUrl: shipment.trackingUrl || null,
    labelUrl: shipment.labelUrl || null,
    manifestUrl: shipment.manifestUrl || null,
    pickupStatus: shipment.pickupStatus || null,
    pickupTokenNumber: shipment.pickupTokenNumber || null,
    pickupScheduledDate: shipment.pickupScheduledDate || null,
    lastTrackingUpdate: shipment.lastTrackingUpdate || null,
    errorMessage: shipment.errorMessage || null,
    packageDetails: {
      weight: shipment.weight !== null && shipment.weight !== undefined ? Number(shipment.weight) : null,
      length: shipment.length !== null && shipment.length !== undefined ? Number(shipment.length) : null,
      breadth: shipment.breadth !== null && shipment.breadth !== undefined ? Number(shipment.breadth) : null,
      height: shipment.height !== null && shipment.height !== undefined ? Number(shipment.height) : null,
    },
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
  };
}

function formatDateForShiprocket(date: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export async function createShipmentForOrder(orderId: string, options: CreateShipmentOptions = {}) {
  // 1. Fetch order with relations
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      shippingAddress: true,
      shipment: true,
    },
  });

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  // Idempotency check: If an active shipment already exists in Shiprocket, return it
  if (
    order.shipment &&
    order.shipment.shiprocketOrderId &&
    order.shipment.status !== ShipmentStatus.FAILED &&
    order.shipment.status !== ShipmentStatus.CANCELLED
  ) {
    logger.info({ orderId, shipmentId: order.shipment.id }, 'Shipment already exists for order. Returning existing.');
    return formatShipmentResponse(order.shipment);
  }

  if (!order.shippingAddress) {
    throw new AppError('Order shipping address is missing. Cannot create shipment without delivery address.', 400);
  }

  const pincode = order.shippingAddress.pincode.trim();
  if (!/^\d{6}$/.test(pincode)) {
    throw new AppError(`Invalid delivery pincode '${pincode}'. Pincode must be exactly 6 digits.`, 422);
  }

  // Dimensions & Weight fallback
  const weight = options.weight || env.SHIPROCKET_DEFAULT_WEIGHT || 0.5;
  const length = options.length || env.SHIPROCKET_DEFAULT_LENGTH || 10;
  const breadth = options.breadth || env.SHIPROCKET_DEFAULT_BREADTH || 10;
  const height = options.height || env.SHIPROCKET_DEFAULT_HEIGHT || 10;
  const pickupLocation = options.pickupLocation || env.SHIPROCKET_PICKUP_LOCATION || 'Primary';

  // Customer Name splitting
  const rawName = (order.shippingAddress.name || order.customerName || 'Customer').trim();
  const nameParts = rawName.split(' ');
  const firstName = nameParts[0] || 'Customer';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Customer';

  // Map Items
  const orderItems = order.items.map((item) => ({
    name: item.productName.substring(0, 200),
    sku: item.variantId || item.productId || `ITEM-${item.id.substring(0, 8)}`,
    units: item.quantity,
    selling_price: Number(item.unitSellPrice),
    discount: 0,
    tax: Number(item.gst),
  }));

  const payload: ShiprocketAdhocOrderPayload = {
    order_id: order.orderNumber,
    order_date: formatDateForShiprocket(order.createdAt),
    pickup_location: pickupLocation,
    channel_id: '',
    comment: `Lamkosh order ${order.orderNumber}`,
    billing_customer_name: firstName,
    billing_last_name: lastName,
    billing_address: order.shippingAddress.address,
    billing_address_2: order.shippingAddress.landmark || order.shippingAddress.district || '',
    billing_city: order.shippingAddress.city || order.shippingAddress.district || order.shippingAddress.homeTown || 'City',
    billing_pincode: pincode,
    billing_state: order.shippingAddress.state,
    billing_country: 'India',
    billing_email: order.shippingAddress.email || order.customerEmail || 'orders@lamkosh.com',
    billing_phone: order.shippingAddress.mobileNumber || order.customerMobile,
    shipping_is_billing: true,
    order_items: orderItems,
    payment_method: order.paymentMethod === 'ONLINE' ? 'Prepaid' : 'COD',
    sub_total: Number(order.totalAmount),
    length,
    breadth,
    height,
    weight,
  };

  try {
    const res = await shiprocketClient.createAdhocOrder(payload);

    const shiprocketOrderId = res.order_id ? String(res.order_id) : null;
    const shiprocketShipmentId = res.shipment_id ? String(res.shipment_id) : null;
    const awbCode = res.awb_code || null;
    const courierName = res.courier_name || null;

    let initialStatus: ShipmentStatus = ShipmentStatus.ORDER_CREATED;
    if (awbCode) {
      initialStatus = ShipmentStatus.AWB_ASSIGNED;
    }

    const savedShipment = await prisma.shipment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        shiprocketOrderId,
        shiprocketShipmentId,
        awbCode,
        courierName,
        status: initialStatus,
        weight,
        length,
        breadth,
        height,
        errorMessage: null,
      },
      update: {
        shiprocketOrderId,
        shiprocketShipmentId,
        awbCode,
        courierName,
        status: initialStatus,
        weight,
        length,
        breadth,
        height,
        errorMessage: null,
      },
    });

    return formatShipmentResponse(savedShipment);
  } catch (err: any) {
    const sanitizedError = err.message || 'Unknown error during Shiprocket order creation';
    logger.error({ orderId, error: sanitizedError }, 'Shiprocket order creation failed');

    // Record failure in DB while preserving the local order
    const failedShipment = await prisma.shipment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        status: ShipmentStatus.FAILED,
        errorMessage: sanitizedError,
        weight,
        length,
        breadth,
        height,
      },
      update: {
        status: ShipmentStatus.FAILED,
        errorMessage: sanitizedError,
        weight,
        length,
        breadth,
        height,
      },
    });

    throw new AppError(`Shiprocket shipment creation failed: ${sanitizedError}`, err.statusCode || 502, [
      formatShipmentResponse(failedShipment),
    ]);
  }
}

export async function checkCourierServiceability(query: {
  delivery_postcode?: string;
  pickup_postcode?: string;
  weight?: number;
  cod?: number;
  orderId?: string;
}) {
  let deliveryPostcode = query.delivery_postcode;
  let cod = query.cod !== undefined ? query.cod : 0;
  let weight = query.weight || env.SHIPROCKET_DEFAULT_WEIGHT || 0.5;

  if (query.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: query.orderId },
      include: { shippingAddress: true, shipment: true },
    });
    if (!order) {
      throw new AppError('Order not found for serviceability check', 404);
    }
    if (order.shippingAddress) {
      deliveryPostcode = order.shippingAddress.pincode;
    }
    cod = order.paymentMethod === 'CASH_ON_DELIVERY' ? 1 : 0;
    if (order.shipment?.weight) {
      weight = Number(order.shipment.weight);
    }
  }

  if (!deliveryPostcode || !/^\d{6}$/.test(deliveryPostcode)) {
    throw new AppError('A valid 6-digit delivery pincode is required to check serviceability', 400);
  }

  const pickupPostcode = query.pickup_postcode || '110001';

  const result = await shiprocketClient.checkServiceability({
    delivery_postcode: deliveryPostcode,
    pickup_postcode: pickupPostcode,
    weight,
    cod: cod === 1 ? 1 : 0,
  });

  return {
    delivery_postcode: deliveryPostcode,
    pickup_postcode: pickupPostcode,
    weight,
    cod: cod === 1,
    data: result.data || result,
  };
}

export async function assignCourierAwb(orderId: string, courierId?: number) {
  const shipment = await prisma.shipment.findUnique({
    where: { orderId },
  });

  if (!shipment || !shipment.shiprocketShipmentId) {
    throw new AppError(
      'Shipment record with a valid Shiprocket Shipment ID not found. Please create the shipment order first.',
      400
    );
  }

  if (shipment.status === ShipmentStatus.CANCELLED) {
    throw new AppError('Cannot assign AWB to a cancelled shipment', 400);
  }

  if (shipment.awbCode) {
    return formatShipmentResponse(shipment);
  }

  const res = await shiprocketClient.assignAwb({
    shipment_id: shipment.shiprocketShipmentId,
    courier_id: courierId,
  });

  const awbCode = res.response?.data?.awb_code || res.awb_code;
  const courierName = res.response?.data?.courier_name || res.courier_name || shipment.courierName;
  const assignedCourierId = res.response?.data?.courier_company_id || courierId || shipment.courierId;

  if (!awbCode) {
    throw new AppError(
      res.message || 'Shiprocket did not return an AWB code. Courier assignment may have failed.',
      400
    );
  }

  const updatedShipment = await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      awbCode: String(awbCode),
      courierName: courierName ? String(courierName) : undefined,
      courierId: assignedCourierId ? Number(assignedCourierId) : undefined,
      status: ShipmentStatus.AWB_ASSIGNED,
      errorMessage: null,
    },
  });

  return formatShipmentResponse(updatedShipment);
}

export async function requestPickup(orderId: string) {
  const shipment = await prisma.shipment.findUnique({
    where: { orderId },
  });

  if (!shipment || !shipment.shiprocketShipmentId) {
    throw new AppError('Shipment record with a valid Shiprocket Shipment ID not found', 400);
  }

  if (!shipment.awbCode) {
    throw new AppError('AWB must be assigned before requesting pickup', 400);
  }

  if (shipment.status === ShipmentStatus.CANCELLED) {
    throw new AppError('Cannot request pickup for a cancelled shipment', 400);
  }

  const res = await shiprocketClient.generatePickup({
    shipment_id: [shipment.shiprocketShipmentId],
  });

  const pickupScheduledDateStr = res.response?.pickup_scheduled_date || res.pickup_scheduled_date;
  const pickupTokenNumber = res.response?.pickup_token_number || res.pickup_token_number;

  const updatedShipment = await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      pickupStatus: 'SCHEDULED',
      pickupTokenNumber: pickupTokenNumber ? String(pickupTokenNumber) : undefined,
      pickupScheduledDate: pickupScheduledDateStr ? new Date(pickupScheduledDateStr) : new Date(),
      status: ShipmentStatus.PICKUP_SCHEDULED,
      errorMessage: null,
    },
  });

  return {
    rawResponse: res,
    shipment: formatShipmentResponse(updatedShipment),
  };
}

export async function generateShippingLabel(orderId: string) {
  const shipment = await prisma.shipment.findUnique({
    where: { orderId },
  });

  if (!shipment || !shipment.shiprocketShipmentId) {
    throw new AppError('Shipment record with a valid Shiprocket Shipment ID not found', 400);
  }

  if (!shipment.awbCode) {
    throw new AppError('AWB must be assigned before generating shipping label', 400);
  }

  const res = await shiprocketClient.generateLabel({
    shipment_id: [shipment.shiprocketShipmentId],
  });

  const labelUrl = res.label_url || res.response?.label_url;
  if (!labelUrl) {
    throw new AppError(res.message || 'Shiprocket did not return a label URL', 400);
  }

  const updatedShipment = await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      labelUrl: String(labelUrl),
    },
  });

  return {
    labelUrl,
    shipment: formatShipmentResponse(updatedShipment),
  };
}

export async function generateManifest(orderId: string) {
  const shipment = await prisma.shipment.findUnique({
    where: { orderId },
  });

  if (!shipment || !shipment.shiprocketShipmentId) {
    throw new AppError('Shipment record with a valid Shiprocket Shipment ID not found', 400);
  }

  if (!shipment.awbCode) {
    throw new AppError('AWB must be assigned before generating manifest', 400);
  }

  const res = await shiprocketClient.generateManifest({
    shipment_id: [shipment.shiprocketShipmentId],
  });

  const manifestUrl = res.manifest_url || res.response?.url || res.url;
  if (!manifestUrl) {
    throw new AppError(res.message || 'Shiprocket did not return a manifest URL', 400);
  }

  const updatedShipment = await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      manifestUrl: String(manifestUrl),
    },
  });

  return {
    manifestUrl,
    shipment: formatShipmentResponse(updatedShipment),
  };
}

export async function trackShipment(identifier: { awbCode?: string; orderId?: string }) {
  let shipment: any = null;

  if (identifier.orderId) {
    shipment = await prisma.shipment.findUnique({
      where: { orderId: identifier.orderId },
      include: { order: true },
    });
  } else if (identifier.awbCode) {
    shipment = await prisma.shipment.findFirst({
      where: { awbCode: identifier.awbCode },
      include: { order: true },
    });
  }

  const awbCode = identifier.awbCode || shipment?.awbCode;
  if (!awbCode) {
    if (shipment) {
      return {
        shipment: formatShipmentResponse(shipment),
        trackingData: null,
      };
    }
    throw new AppError('AWB code is required for tracking', 400);
  }

  const res = await shiprocketClient.trackByAwb(awbCode);
  const trackingData = res.tracking_data || res;

  // Status mapping
  const shipmentStatusLabel = (
    trackingData.shipment_status_label ||
    trackingData.shipment_track?.[0]?.current_status ||
    ''
  ).toUpperCase();

  const trackingUrl = trackingData.tracking_url || shipment?.trackingUrl;
  let newShipmentStatus: ShipmentStatus | null = null;
  let newOrderStatus: OrderStatus | null = null;

  if (shipmentStatusLabel.includes('DELIVERED')) {
    newShipmentStatus = ShipmentStatus.DELIVERED;
    newOrderStatus = OrderStatus.DELIVERED;
  } else if (shipmentStatusLabel.includes('OUT FOR DELIVERY')) {
    newShipmentStatus = ShipmentStatus.OUT_FOR_DELIVERY;
    newOrderStatus = OrderStatus.SHIPPED;
  } else if (shipmentStatusLabel.includes('TRANSIT') || shipmentStatusLabel.includes('REACHED')) {
    newShipmentStatus = ShipmentStatus.IN_TRANSIT;
    newOrderStatus = OrderStatus.SHIPPED;
  } else if (shipmentStatusLabel.includes('PICKED')) {
    newShipmentStatus = ShipmentStatus.PICKED_UP;
    newOrderStatus = OrderStatus.SHIPPED;
  } else if (shipmentStatusLabel.includes('CANCEL')) {
    newShipmentStatus = ShipmentStatus.CANCELLED;
  }

  if (shipment) {
    const updateData: any = {
      lastTrackingUpdate: new Date(),
    };
    if (newShipmentStatus) updateData.status = newShipmentStatus;
    if (trackingUrl) updateData.trackingUrl = trackingUrl;

    const updatedShipment = await prisma.shipment.update({
      where: { id: shipment.id },
      data: updateData,
    });

    // Update order status if verified delivery or shipping state reached, NEVER overwriting paymentStatus
    if (newOrderStatus && shipment.order && shipment.order.status !== OrderStatus.DELIVERED) {
      if (newOrderStatus === OrderStatus.DELIVERED) {
        await prisma.order.update({
          where: { id: shipment.orderId },
          data: { status: OrderStatus.DELIVERED },
        });
      } else if (
        newOrderStatus === OrderStatus.SHIPPED &&
        (shipment.order.status === OrderStatus.PENDING ||
          shipment.order.status === OrderStatus.CONFIRMED ||
          shipment.order.status === OrderStatus.PROCESSING)
      ) {
        await prisma.order.update({
          where: { id: shipment.orderId },
          data: { status: OrderStatus.SHIPPED },
        });
      }
    }

    return {
      shipment: formatShipmentResponse(updatedShipment),
      trackingData,
    };
  }

  return {
    shipment: null,
    trackingData,
  };
}

export async function cancelShipment(identifier: { orderId?: string; awbCode?: string }) {
  let shipment: any = null;

  if (identifier.orderId) {
    shipment = await prisma.shipment.findUnique({
      where: { orderId: identifier.orderId },
    });
  } else if (identifier.awbCode) {
    shipment = await prisma.shipment.findFirst({
      where: { awbCode: identifier.awbCode },
    });
  }

  if (!shipment) {
    throw new AppError('Shipment record not found', 404);
  }

  if (shipment.status === ShipmentStatus.CANCELLED) {
    return formatShipmentResponse(shipment);
  }

  if (shipment.status === ShipmentStatus.DELIVERED) {
    throw new AppError('Delivered shipment cannot be cancelled', 400);
  }

  // Cancel in Shiprocket
  try {
    if (shipment.awbCode) {
      await shiprocketClient.cancelShipmentByAwbs([shipment.awbCode]);
    } else if (shipment.shiprocketOrderId) {
      await shiprocketClient.cancelOrders([shipment.shiprocketOrderId]);
    }
  } catch (err: any) {
    logger.warn({ error: err.message }, 'Shiprocket API cancellation warning');
  }

  const updatedShipment = await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      status: ShipmentStatus.CANCELLED,
    },
  });

  return formatShipmentResponse(updatedShipment);
}

export async function getCustomerTracking(orderIdOrToken: string, isGuestToken = false, userId?: string) {
  let order: any = null;

  if (isGuestToken) {
    order = await prisma.order.findUnique({
      where: { trackingToken: orderIdOrToken },
      include: { shipment: true, shippingAddress: true },
    });
  } else {
    order = await prisma.order.findUnique({
      where: { id: orderIdOrToken },
      include: { shipment: true, shippingAddress: true },
    });
    if (order && userId && order.userId !== userId) {
      throw new AppError('Unauthorized access to order tracking', 404);
    }
  }

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  let trackingDetails: any = null;
  if (order.shipment?.awbCode) {
    try {
      const trackingResult = await trackShipment({ awbCode: order.shipment.awbCode });
      trackingDetails = trackingResult.trackingData;
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to fetch live tracking from Shiprocket. Serving database snapshot.');
    }
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    shipment: formatShipmentResponse(order.shipment),
    trackingDetails,
  };
}

export async function handleTrackingWebhook(body: any) {
  const awbCode = body.awb || body.awb_code || body.data?.awb_code;
  const shiprocketOrderId = body.order_id ? String(body.order_id) : null;

  if (!awbCode && !shiprocketOrderId) {
    return { status: 'ignored', message: 'No AWB or Order ID provided in webhook' };
  }

  const shipment = await prisma.shipment.findFirst({
    where: {
      OR: [
        awbCode ? { awbCode: String(awbCode) } : undefined,
        shiprocketOrderId ? { shiprocketOrderId } : undefined,
      ].filter(Boolean) as any,
    },
    include: { order: true },
  });

  if (!shipment) {
    return { status: 'not_found', message: 'Shipment not found locally' };
  }

  const rawStatus = (body.current_status || body.shipment_status || body.status || '').toUpperCase();

  let newShipmentStatus: ShipmentStatus | null = null;
  let newOrderStatus: OrderStatus | null = null;

  if (rawStatus.includes('DELIVERED')) {
    newShipmentStatus = ShipmentStatus.DELIVERED;
    newOrderStatus = OrderStatus.DELIVERED;
  } else if (rawStatus.includes('OUT FOR DELIVERY')) {
    newShipmentStatus = ShipmentStatus.OUT_FOR_DELIVERY;
    newOrderStatus = OrderStatus.SHIPPED;
  } else if (rawStatus.includes('TRANSIT')) {
    newShipmentStatus = ShipmentStatus.IN_TRANSIT;
    newOrderStatus = OrderStatus.SHIPPED;
  } else if (rawStatus.includes('PICKED')) {
    newShipmentStatus = ShipmentStatus.PICKED_UP;
    newOrderStatus = OrderStatus.SHIPPED;
  } else if (rawStatus.includes('CANCEL')) {
    newShipmentStatus = ShipmentStatus.CANCELLED;
  }

  if (newShipmentStatus) {
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        status: newShipmentStatus,
        lastTrackingUpdate: new Date(),
      },
    });
  }

  if (newOrderStatus && shipment.order && shipment.order.status !== OrderStatus.DELIVERED) {
    if (newOrderStatus === OrderStatus.DELIVERED) {
      await prisma.order.update({
        where: { id: shipment.orderId },
        data: { status: OrderStatus.DELIVERED },
      });
    } else if (
      newOrderStatus === OrderStatus.SHIPPED &&
      (shipment.order.status === OrderStatus.PENDING ||
        shipment.order.status === OrderStatus.CONFIRMED ||
        shipment.order.status === OrderStatus.PROCESSING)
    ) {
      await prisma.order.update({
        where: { id: shipment.orderId },
        data: { status: OrderStatus.SHIPPED },
      });
    }
  }

  return { status: 'success', shipmentId: shipment.id, mappedStatus: newShipmentStatus };
}
