import crypto from 'crypto';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { hashPassword } from '../utils/password';
import { env } from '../config/env';
import { CartOwner } from './cart.service';
import {
  sendOrderConfirmationEmail,
  sendAdminOrderNotificationEmail,
  sendGuestAccountCreatedEmail,
} from './mail.service';
import { OrderStatus, PaymentStatus } from '@prisma/client';

export interface CheckoutInput {
  name: string;
  mobileNumber: string;
  email: string;
  address: string;
  homeTown: string;
  city: string;
  state: string;
  pincode: string;
}

export interface AdminOrderQueryOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  sortBy?: 'newest' | 'oldest';
}

function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `LAM-${dateStr}-${randomSuffix}`;
}

function generateTrackingToken(): string {
  return `tr_${crypto.randomBytes(20).toString('hex')}`;
}

export function formatOrderResponse(order: any) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    trackingToken: order.trackingToken,
    status: order.status,
    paymentStatus: order.paymentStatus,
    customer: {
      name: order.customerName,
      email: order.customerEmail,
      mobileNumber: order.customerMobile,
      customerType: order.userId ? 'USER' : 'GUEST',
      userId: order.userId || null,
    },
    items: order.items.map((item: any) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      description: item.productDescription,
      color: item.productColor,
      size: item.variantSize,
      quantity: item.quantity,
      unitBasePrice: Number(item.unitBasePrice),
      unitPrice: Number(item.unitSellPrice),
      gst: Number(item.gst),
      lineTotal: Number(item.lineTotal),
      productImage: item.productImage,
    })),
    shippingAddress: order.shippingAddress
      ? {
          name: order.shippingAddress.name,
          mobileNumber: order.shippingAddress.mobileNumber,
          email: order.shippingAddress.email,
          address: order.shippingAddress.address,
          homeTown: order.shippingAddress.homeTown,
          city: order.shippingAddress.city,
          state: order.shippingAddress.state,
          pincode: order.shippingAddress.pincode,
        }
      : null,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    shippingCharge: Number(order.shippingCharge),
    totalAmount: Number(order.totalAmount),
    currency: order.currency,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export async function createOrder(owner: CartOwner, input: CheckoutInput) {
  const customerEmail = input.email.toLowerCase().trim();
  const customerMobile = input.mobileNumber.trim();
  const customerName = input.name.trim();

  let isNewAccountCreated = false;

  const orderResult = await prisma.$transaction(async (tx) => {
    // 1. Fetch cart & items
    let cart: any = null;
    if (owner.userId) {
      cart = await tx.cart.findUnique({
        where: { userId: owner.userId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  media: { orderBy: { sortOrder: 'asc' }, take: 1 },
                  variants: true,
                },
              },
              variant: true,
            },
          },
        },
      });
    } else if (owner.guestId) {
      cart = await tx.cart.findUnique({
        where: { guestId: owner.guestId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  media: { orderBy: { sortOrder: 'asc' }, take: 1 },
                  variants: true,
                },
              },
              variant: true,
            },
          },
        },
      });
    }

    if (!cart || cart.items.length === 0) {
      throw new AppError('Cart is empty. Cannot place an order with an empty cart.', 400);
    }

    // 2. Validate products & stock, prepare item snapshots
    let calculatedSubtotal = 0;
    const preparedItems: any[] = [];

    for (const item of cart.items) {
      if (!item.product) {
        throw new AppError('One of the products in your cart is no longer available.', 404);
      }

      const productHasVariants = item.product.variants && item.product.variants.length > 0;
      let availableStock = 0;
      let variantSize: string | null = null;

      if (productHasVariants) {
        if (!item.variantId || !item.variant) {
          throw new AppError(`Variant required for product '${item.product.name}'`, 422);
        }
        variantSize = item.variant.size;
        availableStock = item.variant.stock;
      } else {
        availableStock = item.product.stock;
      }

      if (item.quantity > availableStock) {
        throw new AppError(
          `Requested quantity (${item.quantity}) for '${item.product.name}' exceeds available stock (${availableStock})`,
          409
        );
      }

      const unitBasePrice = Number(item.product.basePrice);
      const unitSellPrice = Number(item.product.sellPrice);
      const gst = Number(item.product.gst);
      const lineTotal = unitSellPrice * item.quantity;
      calculatedSubtotal += lineTotal;

      const primaryImage = item.product.media && item.product.media.length > 0 ? item.product.media[0].url : null;

      preparedItems.push({
        productId: item.productId,
        variantId: item.variantId || null,
        productName: item.product.name,
        productDescription: item.product.description,
        productColor: item.product.color,
        variantSize,
        quantity: item.quantity,
        unitBasePrice,
        unitSellPrice,
        gst,
        lineTotal,
        productImage: primaryImage,
      });
    }

    const shippingCharge = 0;
    const discount = 0;
    const totalAmount = calculatedSubtotal + shippingCharge - discount;

    // 3. Customer Identity / Account Handling
    let targetUserId: string | null = owner.userId || null;

    if (!targetUserId) {
      // Check if user already exists
      const existingUser = await tx.user.findFirst({
        where: {
          OR: [{ email: customerEmail }, { mobile: customerMobile }],
        },
      });

      if (!existingUser) {
        // Create new USER account
        let userRole = await tx.role.findUnique({ where: { name: 'USER' } });
        if (!userRole) {
          userRole = await tx.role.create({
            data: { name: 'USER', description: 'Standard customer user' },
          });
        }

        const tempPassword = `Pass_${crypto.randomBytes(8).toString('hex')}!`;
        const passwordHash = await hashPassword(tempPassword);

        const newlyCreatedUser = await tx.user.create({
          data: {
            name: customerName,
            email: customerEmail,
            mobile: customerMobile,
            passwordHash,
            roleId: userRole.id,
            isVerified: true,
            mustChangePassword: true,
            address: input.address,
          },
        });

        targetUserId = newlyCreatedUser.id;
        isNewAccountCreated = true;
      }
    }

    // 4. Generate orderNumber & trackingToken
    let orderNumber = generateOrderNumber();
    let isUniqueNumber = false;
    let attempts = 0;
    while (!isUniqueNumber && attempts < 5) {
      const existing = await tx.order.findUnique({ where: { orderNumber } });
      if (!existing) {
        isUniqueNumber = true;
      } else {
        orderNumber = generateOrderNumber();
        attempts++;
      }
    }

    const trackingToken = generateTrackingToken();

    // 5. Create Order
    const order = await tx.order.create({
      data: {
        orderNumber,
        trackingToken,
        userId: targetUserId,
        guestId: owner.userId ? null : owner.guestId,
        guestEmail: owner.userId ? null : customerEmail,
        guestMobile: owner.userId ? null : customerMobile,
        customerName,
        customerEmail,
        customerMobile,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: calculatedSubtotal,
        discount,
        shippingCharge,
        totalAmount,
        currency: 'INR',
      },
    });

    // 6. Create OrderAddress Snapshot
    await tx.orderAddress.create({
      data: {
        orderId: order.id,
        name: customerName,
        mobileNumber: customerMobile,
        email: customerEmail,
        address: input.address.trim(),
        homeTown: input.homeTown.trim(),
        city: input.city.trim(),
        state: input.state.trim(),
        pincode: input.pincode.trim(),
      },
    });

    // 7. Create OrderItems & Decrement Stock
    for (const preparedItem of preparedItems) {
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: preparedItem.productId,
          variantId: preparedItem.variantId,
          productName: preparedItem.productName,
          productDescription: preparedItem.productDescription,
          productColor: preparedItem.productColor,
          variantSize: preparedItem.variantSize,
          quantity: preparedItem.quantity,
          unitBasePrice: preparedItem.unitBasePrice,
          unitSellPrice: preparedItem.unitSellPrice,
          gst: preparedItem.gst,
          lineTotal: preparedItem.lineTotal,
          productImage: preparedItem.productImage,
        },
      });

      // Decrement stock
      if (preparedItem.variantId) {
        await tx.productVariant.update({
          where: { id: preparedItem.variantId },
          data: { stock: { decrement: preparedItem.quantity } },
        });
        await tx.product.update({
          where: { id: preparedItem.productId },
          data: { stock: { decrement: preparedItem.quantity } },
        });
      } else {
        await tx.product.update({
          where: { id: preparedItem.productId },
          data: { stock: { decrement: preparedItem.quantity } },
        });
      }
    }

    // 8. Clear Cart Items
    await tx.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    // Fetch complete created order for formatting
    const createdOrder = await tx.order.findUnique({
      where: { id: order.id },
      include: {
        items: true,
        shippingAddress: true,
      },
    });

    return createdOrder;
  });

  const formattedResponse = formatOrderResponse(orderResult);

  // Send emails post-transaction asynchronously
  sendOrderConfirmationEmail(formattedResponse).catch(() => {});

  const notificationEmail = process.env.ORDER_NOTIFICATION_EMAIL || env.SMTP_USER;
  if (notificationEmail) {
    sendAdminOrderNotificationEmail(formattedResponse, notificationEmail).catch(() => {});
  }

  if (isNewAccountCreated) {
    sendGuestAccountCreatedEmail(customerEmail, customerName).catch(() => {});
  }

  return formattedResponse;
}

export async function getUserOrders(userId: string, page = 1, limit = 10) {
  const skip = (page - 1) * limit;

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where: { userId },
      include: {
        items: true,
        shippingAddress: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.order.count({ where: { userId } }),
  ]);

  return {
    orders: orders.map(formatOrderResponse),
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
}

export async function getUserOrderById(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      shippingAddress: true,
    },
  });

  if (!order || order.userId !== userId) {
    throw new AppError('Order not found', 404);
  }

  return formatOrderResponse(order);
}

export async function cancelUserOrder(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, shippingAddress: true },
  });

  if (!order || order.userId !== userId) {
    throw new AppError('Order not found', 404);
  }

  const cancellableStatuses: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING];
  if (!cancellableStatuses.includes(order.status)) {
    throw new AppError(
      `Order cannot be cancelled in status '${order.status}'. Allowed cancellation statuses: ${cancellableStatuses.join(', ')}`,
      400
    );
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    // Restore stock
    for (const item of order.items) {
      if (item.variantId) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
      }
      if (item.productId) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }

    return await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
      include: { items: true, shippingAddress: true },
    });
  });

  return formatOrderResponse(updatedOrder);
}

export async function getGuestOrder(trackingToken: string) {
  const order = await prisma.order.findUnique({
    where: { trackingToken },
    include: {
      items: true,
      shippingAddress: true,
    },
  });

  if (!order) {
    throw new AppError('Order not found with provided tracking token', 404);
  }

  return formatOrderResponse(order);
}

export async function getAdminOrders(options: AdminOrderQueryOptions) {
  const page = options.page && options.page > 0 ? options.page : 1;
  const limit = options.limit && options.limit > 0 ? options.limit : 10;
  const skip = (page - 1) * limit;

  const where: any = {};

  if (options.status) {
    where.status = options.status;
  }

  if (options.paymentStatus) {
    where.paymentStatus = options.paymentStatus;
  }

  if (options.search && options.search.trim() !== '') {
    const term = options.search.trim();
    where.OR = [
      { orderNumber: { contains: term, mode: 'insensitive' } },
      { customerName: { contains: term, mode: 'insensitive' } },
      { customerEmail: { contains: term, mode: 'insensitive' } },
      { customerMobile: { contains: term, mode: 'insensitive' } },
    ];
  }

  const orderBy = options.sortBy === 'oldest' ? { createdAt: 'asc' as const } : { createdAt: 'desc' as const };

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: true,
        shippingAddress: true,
        user: { select: { id: true, name: true, email: true, mobile: true, role: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders: orders.map(formatOrderResponse),
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
}

export async function getAdminOrderById(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      shippingAddress: true,
      user: { select: { id: true, name: true, email: true, mobile: true, role: true } },
    },
  });

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  return formatOrderResponse(order);
}

export async function updateAdminOrderStatus(
  orderId: string,
  input: { status?: OrderStatus; paymentStatus?: PaymentStatus }
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new AppError('Order not found', 404);
  }

  if (input.status && input.status !== order.status) {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      CONFIRMED: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      PROCESSING: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      SHIPPED: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      DELIVERED: [],
      CANCELLED: [],
    };

    const allowed = validTransitions[order.status] || [];
    if (!allowed.includes(input.status)) {
      throw new AppError(
        `Invalid status transition from '${order.status}' to '${input.status}'. Allowed transitions: ${
          allowed.length > 0 ? allowed.join(', ') : 'None (Terminal state)'
        }`,
        400
      );
    }
  }

  const updateData: any = {};
  if (input.status) updateData.status = input.status;
  if (input.paymentStatus) updateData.paymentStatus = input.paymentStatus;

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: updateData,
    include: {
      items: true,
      shippingAddress: true,
    },
  });

  return formatOrderResponse(updatedOrder);
}

export async function cancelAdminOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, shippingAddress: true },
  });

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  if (order.status === OrderStatus.CANCELLED) {
    return formatOrderResponse(order);
  }

  if (order.status === OrderStatus.DELIVERED) {
    throw new AppError('Delivered orders cannot be cancelled', 400);
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    // Restore stock
    for (const item of order.items) {
      if (item.variantId) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
      }
      if (item.productId) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }

    return await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
      include: { items: true, shippingAddress: true },
    });
  });

  return formatOrderResponse(updatedOrder);
}
