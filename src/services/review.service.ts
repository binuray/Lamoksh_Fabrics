import { Prisma, ReviewStatus, OrderStatus } from '@prisma/client';
import sanitizeHtml from 'sanitize-html';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error.middleware';

export interface CreateReviewInput {
  productId: string;
  orderId: string;
  rating: number;
  comment: string;
}

export interface UpdateReviewInput {
  rating?: number;
  comment?: string;
}

export interface GetProductReviewsOptions {
  page?: number;
  limit?: number;
  rating?: number;
  sortBy?: 'newest' | 'oldest' | 'rating_high' | 'rating_low';
  status?: ReviewStatus | 'ALL';
}

export interface AdminReviewQueryOptions {
  page?: number;
  limit?: number;
  status?: ReviewStatus;
  productId?: string;
  userId?: string;
  orderId?: string;
  rating?: number;
  search?: string;
  sortBy?: 'newest' | 'oldest' | 'rating_high' | 'rating_low';
}

export function formatReviewResponse(review: any) {
  return {
    id: review.id,
    userId: review.userId,
    user: review.user
      ? {
          id: review.user.id,
          name: review.user.name,
          email: review.user.email,
        }
      : undefined,
    productId: review.productId,
    product: review.product
      ? {
          id: review.product.id,
          name: review.product.name,
          color: review.product.color,
          media: review.product.media || [],
        }
      : undefined,
    orderId: review.orderId,
    orderNumber: review.order ? review.order.orderNumber : undefined,
    orderStatus: review.order ? review.order.status : undefined,
    rating: review.rating,
    comment: review.comment,
    status: review.status,
    adminFeedback: review.adminFeedback || null,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

/**
 * Clean review comment to strip any dangerous HTML tags and whitespace
 */
function sanitizeComment(comment: string): string {
  if (!comment || typeof comment !== 'string') {
    return '';
  }
  return sanitizeHtml(comment, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

/**
 * Submit a product review and rating.
 * Strict checks:
 * 1. Product must exist in database.
 * 2. Order must exist in database.
 * 3. Order ownership must belong to authenticated customer.
 * 4. Order status must be DELIVERED.
 * 5. Product must be in order items.
 * 6. Customer can only submit one review per product per delivered order.
 */
export async function submitReview(userId: string, input: CreateReviewInput) {
  if (!input.productId) {
    throw new AppError('Product ID is required', 400);
  }
  if (!input.orderId) {
    throw new AppError('Order ID is required', 400);
  }

  // 1. Verify Product exists
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
  });
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  // 2. Verify Order exists with items
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { items: true },
  });
  if (!order) {
    throw new AppError('Order not found', 404);
  }

  // 3. Verify Order Ownership from DB (Never trust frontend-provided user IDs)
  if (order.userId !== userId) {
    throw new AppError('You can only review products from your own orders', 403);
  }

  // 4. Verify Order Status from DB is DELIVERED
  if (order.status !== OrderStatus.DELIVERED) {
    throw new AppError(
      `Reviews can only be submitted for delivered orders. Current order status is ${order.status}`,
      400
    );
  }

  // 5. Verify Product was actually purchased in this Order
  const itemInOrder = order.items.find((item) => item.productId === input.productId);
  if (!itemInOrder) {
    throw new AppError('Product was not found in the specified order', 400);
  }

  // 6. Check for duplicate review (One review per customer per product per delivered order)
  const existingReview = await prisma.review.findUnique({
    where: {
      userId_productId_orderId: {
        userId,
        productId: input.productId,
        orderId: input.orderId,
      },
    },
  });

  if (existingReview) {
    throw new AppError(
      'You have already submitted a review for this product in this order',
      409
    );
  }

  // Sanitize comment
  const cleanComment = sanitizeComment(input.comment);
  if (!cleanComment) {
    throw new AppError('Review comment cannot be empty', 400);
  }

  const review = await prisma.review.create({
    data: {
      userId,
      productId: input.productId,
      orderId: input.orderId,
      rating: input.rating,
      comment: cleanComment,
      status: ReviewStatus.PENDING,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      product: { select: { id: true, name: true, color: true } },
      order: { select: { id: true, orderNumber: true, status: true } },
    },
  });

  return formatReviewResponse(review);
}

/**
 * Fetch product reviews with pagination, sorting, and rating filters.
 * By default returns APPROVED reviews for public consumption, or filtered by status.
 */
export async function getProductReviews(
  productId: string,
  options: GetProductReviewsOptions = {}
) {
  // Check product exists
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 10));
  const skip = (page - 1) * limit;

  const where: Prisma.ReviewWhereInput = {
    productId,
  };

  if (options.status && options.status === 'ALL') {
    // No status filter
  } else if (options.status) {
    where.status = options.status;
  } else {
    // Default to APPROVED for public view
    where.status = ReviewStatus.APPROVED;
  }

  if (options.rating && options.rating >= 1 && options.rating <= 5) {
    where.rating = options.rating;
  }

  let orderBy: Prisma.ReviewOrderByWithRelationInput = { createdAt: 'desc' };
  if (options.sortBy === 'oldest') {
    orderBy = { createdAt: 'asc' };
  } else if (options.sortBy === 'rating_high') {
    orderBy = { rating: 'desc' };
  } else if (options.sortBy === 'rating_low') {
    orderBy = { rating: 'asc' };
  }

  const [reviews, totalCount] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, color: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.review.count({ where }),
  ]);

  const summary = await getProductRatingSummary(productId, options.status);

  return {
    reviews: reviews.map((r) => ({
      id: r.id,
      userId: r.userId,
      user: r.user ? { id: r.user.id, name: r.user.name } : undefined,
      productId: r.productId,
      orderId: r.orderId,
      rating: r.rating,
      comment: r.comment,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
    summary,
  };
}

/**
 * Get average ratings and total review counts for a product.
 */
export async function getProductRatingSummary(
  productId: string,
  statusFilter?: ReviewStatus | 'ALL'
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true },
  });
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const where: Prisma.ReviewWhereInput = { productId };
  if (statusFilter && statusFilter === 'ALL') {
    // count all
  } else if (statusFilter) {
    where.status = statusFilter;
  } else {
    where.status = ReviewStatus.APPROVED;
  }

  const [agg, distribution] = await Promise.all([
    prisma.review.aggregate({
      where,
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prisma.review.groupBy({
      by: ['rating'],
      where,
      _count: { rating: true },
    }),
  ]);

  const ratingDistribution: Record<number, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  distribution.forEach((group) => {
    ratingDistribution[group.rating] = group._count.rating;
  });

  const averageRating = agg._avg.rating ? Number(agg._avg.rating.toFixed(2)) : 0;
  const totalReviews = agg._count.rating || 0;

  return {
    productId: product.id,
    productName: product.name,
    averageRating,
    totalReviews,
    ratingDistribution,
  };
}

/**
 * Fetch all reviews submitted by the logged-in user.
 */
export async function getUserReviews(
  userId: string,
  page = 1,
  limit = 10
) {
  const p = Math.max(1, page);
  const l = Math.min(100, Math.max(1, limit));
  const skip = (p - 1) * l;

  const where: Prisma.ReviewWhereInput = { userId };

  const [reviews, totalCount] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            color: true,
            media: true,
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: l,
    }),
    prisma.review.count({ where }),
  ]);

  return {
    reviews: reviews.map(formatReviewResponse),
    pagination: {
      page: p,
      limit: l,
      totalCount,
      totalPages: Math.ceil(totalCount / l),
    },
  };
}

/**
 * Fetch single review by ID.
 */
export async function getReviewById(reviewId: string) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: {
      user: { select: { id: true, name: true, email: true, mobile: true } },
      product: { select: { id: true, name: true, color: true, media: true } },
      order: { select: { id: true, orderNumber: true, status: true, createdAt: true } },
    },
  });

  if (!review) {
    throw new AppError('Review not found', 404);
  }

  return formatReviewResponse(review);
}

/**
 * Admin view of reviews with advanced filtering, searching, and pagination.
 */
export async function getAdminReviews(options: AdminReviewQueryOptions = {}) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 10));
  const skip = (page - 1) * limit;

  const where: Prisma.ReviewWhereInput = {};

  if (options.status) {
    where.status = options.status;
  }
  if (options.productId) {
    where.productId = options.productId;
  }
  if (options.userId) {
    where.userId = options.userId;
  }
  if (options.orderId) {
    where.orderId = options.orderId;
  }
  if (options.rating) {
    where.rating = options.rating;
  }

  if (options.search && options.search.trim()) {
    const term = options.search.trim();
    where.OR = [
      { comment: { contains: term, mode: 'insensitive' } },
      { user: { name: { contains: term, mode: 'insensitive' } } },
      { user: { email: { contains: term, mode: 'insensitive' } } },
      { product: { name: { contains: term, mode: 'insensitive' } } },
      { order: { orderNumber: { contains: term, mode: 'insensitive' } } },
    ];
  }

  let orderBy: Prisma.ReviewOrderByWithRelationInput = { createdAt: 'desc' };
  if (options.sortBy === 'oldest') {
    orderBy = { createdAt: 'asc' };
  } else if (options.sortBy === 'rating_high') {
    orderBy = { rating: 'desc' };
  } else if (options.sortBy === 'rating_low') {
    orderBy = { rating: 'asc' };
  }

  const [reviews, totalCount] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, mobile: true } },
        product: { select: { id: true, name: true, color: true } },
        order: { select: { id: true, orderNumber: true, status: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.review.count({ where }),
  ]);

  return {
    reviews: reviews.map(formatReviewResponse),
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
}

/**
 * Admin moderate review: update status to APPROVED or REJECTED with optional feedback.
 */
export async function moderateReview(
  reviewId: string,
  status: ReviewStatus,
  adminFeedback?: string
) {
  const existing = await prisma.review.findUnique({
    where: { id: reviewId },
  });

  if (!existing) {
    throw new AppError('Review not found', 404);
  }

  const updateData: Prisma.ReviewUpdateInput = {
    status,
  };

  if (adminFeedback !== undefined) {
    updateData.adminFeedback = adminFeedback ? adminFeedback.trim() : null;
  }

  const updatedReview = await prisma.review.update({
    where: { id: reviewId },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, email: true } },
      product: { select: { id: true, name: true, color: true } },
      order: { select: { id: true, orderNumber: true, status: true } },
    },
  });

  return formatReviewResponse(updatedReview);
}

/**
 * Admin delete review.
 */
export async function deleteReviewByAdmin(reviewId: string) {
  const existing = await prisma.review.findUnique({
    where: { id: reviewId },
  });

  if (!existing) {
    throw new AppError('Review not found', 404);
  }

  await prisma.review.delete({
    where: { id: reviewId },
  });

  return { id: reviewId };
}
