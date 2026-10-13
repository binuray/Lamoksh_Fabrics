import { Router } from 'express';
import {
  addToCartHandler,
  getCartHandler,
  updateCartItemHandler,
  removeCartItemHandler,
  clearCartHandler,
  checkCartItemHandler,
  mergeCartHandler,
} from '../controllers/cart.controller';
import { optionalAuth } from '../middleware/optionalAuth.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import {
  addToCartSchema,
  updateCartItemSchema,
  mergeCartSchema,
} from '../validators/cart.validator';

const router = Router();

router.post('/items', optionalAuth, validateRequest(addToCartSchema), addToCartHandler);
router.get('/', optionalAuth, getCartHandler);
router.put('/items/:itemId', optionalAuth, validateRequest(updateCartItemSchema), updateCartItemHandler);
router.delete('/items/:itemId', optionalAuth, removeCartItemHandler);
router.delete('/', optionalAuth, clearCartHandler);
router.get('/check', optionalAuth, checkCartItemHandler);
router.post('/merge', authenticate, validateRequest(mergeCartSchema), mergeCartHandler);

export default router;
