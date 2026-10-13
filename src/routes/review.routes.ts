import { Router } from 'express';
import {
  submitReviewHandler,
  getProductReviewsHandler,
  getProductRatingSummaryHandler,
  getUserReviewsHandler,
  getReviewByIdHandler,
  getAdminReviewsHandler,
  getAdminReviewByIdHandler,
  moderateReviewHandler,
  approveReviewHandler,
  rejectReviewHandler,
  deleteReviewHandler,
} from '../controllers/review.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import {
  createReviewSchema,
  moderateReviewSchema,
  rejectReviewSchema,
} from '../validators/review.validator';

export const customerReviewRouter = Router();

// Customer Endpoints (Protected)
customerReviewRouter.post('/', authenticate, validateRequest(createReviewSchema), submitReviewHandler);
customerReviewRouter.get('/my-reviews', authenticate, getUserReviewsHandler);
customerReviewRouter.get('/user', authenticate, getUserReviewsHandler);

// Public Product Review & Summary Endpoints
customerReviewRouter.get('/product/:productId', getProductReviewsHandler);
customerReviewRouter.get('/product/:productId/summary', getProductRatingSummaryHandler);
customerReviewRouter.get('/product/:productId/ratings', getProductRatingSummaryHandler);

// Review Details
customerReviewRouter.get('/:id', getReviewByIdHandler);

export const adminReviewRouter = Router();

// Admin Review Management (Protected by existing Admin Auth & RBAC)
adminReviewRouter.use(authenticate);
adminReviewRouter.use(authorizeRoles('SUPER_ADMIN', 'ADMIN'));

adminReviewRouter.get('/', getAdminReviewsHandler);
adminReviewRouter.get('/:id', getAdminReviewByIdHandler);
adminReviewRouter.patch('/:id/status', validateRequest(moderateReviewSchema), moderateReviewHandler);
adminReviewRouter.patch('/:id/approve', approveReviewHandler);
adminReviewRouter.patch('/:id/reject', validateRequest(rejectReviewSchema), rejectReviewHandler);
adminReviewRouter.delete('/:id', deleteReviewHandler);
