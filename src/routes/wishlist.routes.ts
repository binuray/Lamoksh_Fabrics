import { Router } from 'express';
import {
  addToWishlistHandler,
  getWishlistHandler,
  removeWishlistItemHandler,
  clearWishlistHandler,
  checkWishlistStatusHandler,
  mergeWishlistHandler,
} from '../controllers/wishlist.controller';
import { optionalAuth } from '../middleware/optionalAuth.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import {
  addToWishlistSchema,
  mergeWishlistSchema,
} from '../validators/wishlist.validator';

const router = Router();

router.post('/items', optionalAuth, validateRequest(addToWishlistSchema), addToWishlistHandler);
router.get('/', optionalAuth, getWishlistHandler);
router.delete('/items/:itemId', optionalAuth, removeWishlistItemHandler);
router.delete('/', optionalAuth, clearWishlistHandler);
router.get('/check/:productId', optionalAuth, checkWishlistStatusHandler);
router.post('/merge', authenticate, validateRequest(mergeWishlistSchema), mergeWishlistHandler);

export default router;
