import { Router } from 'express';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';
import { adminCategoryRouter, publicCategoryRouter } from './category.routes';
import { adminProductRouter, publicProductRouter } from './product.routes';
import cartRoutes from './cart.routes';
import wishlistRoutes from './wishlist.routes';
import { customerOrderRouter, adminOrderRouter } from './order.routes';
import profileRoutes from './profile.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/admins', adminRoutes);

// Admin Management APIs
router.use('/admin/categories', adminCategoryRouter);
router.use('/admin/products', adminProductRouter);
router.use('/admin/orders', adminOrderRouter);

// Public / Customer Category & Product APIs
router.use('/categories', publicCategoryRouter);
router.use('/products', publicProductRouter);

// Cart & Wishlist APIs
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);

// Customer Order & Profile APIs
router.use('/orders', customerOrderRouter);
router.use('/profile', profileRoutes);

export default router;

