import { Request, Response, NextFunction } from 'express';
import { ReviewStatus } from '@prisma/client';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middleware/error.middleware';
import {
  submitReview,
  getProductReviews,
  getProductRatingSummary,
  getUserReviews,
  getReviewById,
  getAdminReviews,
  moderateReview,
  deleteReviewByAdmin,
} from '../services/review.service';

/**
 * Submit review for a purchased product
 */
export async function submitReviewHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const productId = (req.params.productId || req.body.productId) as string;
    if (!productId) {
      throw new AppError('Product ID is required', 400);
    }

    const review = await submitReview(req.user.id, {
      productId,
      orderId: req.body.orderId,
      rating: req.body.rating,
      comment: req.body.comment,
    });

    sendSuccess(res, 201, 'Review submitted successfully', { review });
  } catch (error) {
    next(error);
  }
}

/**
 * Public product reviews listing with pagination & sorting
 */
export async function getProductReviewsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const productId = req.params.productId as string;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const rating = req.query.rating ? parseInt(req.query.rating as string, 10) : undefined;
    const sortBy = req.query.sortBy as 'newest' | 'oldest' | 'rating_high' | 'rating_low' | undefined;
    const status = req.query.status as ReviewStatus | 'ALL' | undefined;

    const result = await getProductReviews(productId, {
      page,
      limit,
      rating,
      sortBy,
      status,
    });

    sendSuccess(res, 200, 'Product reviews retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

/**
 * Public product rating summary (average score and rating distribution counts)
 */
export async function getProductRatingSummaryHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const productId = req.params.productId as string;
    const status = req.query.status as ReviewStatus | 'ALL' | undefined;

    const summary = await getProductRatingSummary(productId, status);

    sendSuccess(res, 200, 'Product rating summary retrieved successfully', summary);
  } catch (error) {
    next(error);
  }
}

/**
 * Fetch reviews submitted by the authenticated customer
 */
export async function getUserReviewsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    const result = await getUserReviews(req.user.id, page, limit);

    sendSuccess(res, 200, 'User reviews retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

/**
 * Get single review details by ID
 */
export async function getReviewByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const reviewId = req.params.id as string;
    const review = await getReviewById(reviewId);

    sendSuccess(res, 200, 'Review retrieved successfully', { review });
  } catch (error) {
    next(error);
  }
}

export const getAdminReviewByIdHandler = getReviewByIdHandler;

/**
 * Admin: List all reviews across the platform with filtering
 */
export async function getAdminReviewsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const status = req.query.status as ReviewStatus | undefined;
    const productId = req.query.productId as string | undefined;
    const userId = req.query.userId as string | undefined;
    const orderId = req.query.orderId as string | undefined;
    const rating = req.query.rating ? parseInt(req.query.rating as string, 10) : undefined;
    const search = req.query.search as string | undefined;
    const sortBy = req.query.sortBy as 'newest' | 'oldest' | 'rating_high' | 'rating_low' | undefined;

    const result = await getAdminReviews({
      page,
      limit,
      status,
      productId,
      userId,
      orderId,
      rating,
      search,
      sortBy,
    });

    sendSuccess(res, 200, 'Reviews retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Moderate review (update status to APPROVED / REJECTED / PENDING with feedback)
 */
export async function moderateReviewHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const reviewId = req.params.id as string;
    const { status, adminFeedback } = req.body;

    const review = await moderateReview(reviewId, status, adminFeedback);

    sendSuccess(res, 200, 'Review status updated successfully', { review });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Approve a review
 */
export async function approveReviewHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const reviewId = req.params.id as string;
    const review = await moderateReview(reviewId, ReviewStatus.APPROVED);

    sendSuccess(res, 200, 'Review approved successfully', { review });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Reject a review with optional feedback
 */
export async function rejectReviewHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const reviewId = req.params.id as string;
    const { adminFeedback } = req.body;

    const review = await moderateReview(reviewId, ReviewStatus.REJECTED, adminFeedback);

    sendSuccess(res, 200, 'Review rejected successfully', { review });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: Delete a review permanently
 */
export async function deleteReviewHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const reviewId = req.params.id as string;
    const result = await deleteReviewByAdmin(reviewId);

    sendSuccess(res, 200, 'Review deleted successfully', result);
  } catch (error) {
    next(error);
  }
}
