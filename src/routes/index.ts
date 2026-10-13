import { Router } from 'express';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';
import { adminCategoryRouter, publicCategoryRouter } from './category.routes';
import { adminProductRouter, publicProductRouter } from './product.routes';
import cartRoutes from './cart.routes';
import wishlistRoutes from './wishlist.routes';
import { customerOrderRouter, adminOrderRouter } from './order.routes';
import profileRoutes from './profile.routes';
import { adminBlogRouter, publicBlogRouter } from './blog.routes';
import { customerReviewRouter, adminReviewRouter } from './review.routes';
import { adminEnquiryRouter, publicEnquiryRouter } from './enquiry.routes';
import { adminShippingRouter, publicShippingRouter } from './shipping.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/admins', adminRoutes);

// Admin Management APIs
router.use('/admin/categories', adminCategoryRouter);
router.use('/admin/products', adminProductRouter);
router.use('/admin/orders', adminOrderRouter);
router.use('/admin/shipping', adminShippingRouter);
router.use('/admin/blogs', adminBlogRouter);
router.use('/admin/reviews', adminReviewRouter);

// Public / Customer Category & Product APIs
router.use('/categories', publicCategoryRouter);
router.use('/products', publicProductRouter);

// Public Blog APIs
router.use('/blogs', publicBlogRouter);

// Cart & Wishlist APIs
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);

// Customer Order & Profile APIs
router.use('/orders', customerOrderRouter);
router.use('/profile', profileRoutes);
router.use('/shipping', publicShippingRouter);

// Reviews & Ratings APIs
router.use('/reviews', customerReviewRouter);

// Contact & Enquiry Management APIs
router.use('/admin/enquiries', adminEnquiryRouter);
router.use('/admin/contact', adminEnquiryRouter);
router.use('/enquiries', publicEnquiryRouter);
router.use('/contact', publicEnquiryRouter);

export default router;

