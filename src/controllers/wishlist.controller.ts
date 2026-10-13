import { Request, Response, NextFunction } from 'express';
import * as wishlistService from '../services/wishlist.service';
import { sendSuccess, sendError } from '../utils/response';

function getOwner(req: Request): wishlistService.WishlistOwner {
  return {
    userId: req.user?.id,
    guestId: req.user ? undefined : req.guestId,
  };
}

export async function addToWishlistHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const owner = getOwner(req);
    const result = await wishlistService.addToWishlist(owner, req.body.productId);
    const statusCode = result.alreadyInWishlist ? 200 : 201;
    sendSuccess(res, statusCode, result.message, {
      item: result.item,
      guestId: req.user ? undefined : req.guestId,
    });
  } catch (error) {
    next(error);
  }
}

export async function getWishlistHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const owner = getOwner(req);
    const wishlist = await wishlistService.getWishlist(owner);
    sendSuccess(res, 200, 'Wishlist retrieved successfully', {
      wishlist,
      guestId: req.user ? undefined : req.guestId,
    });
  } catch (error) {
    next(error);
  }
}

export async function removeWishlistItemHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const owner = getOwner(req);
    const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
    await wishlistService.removeWishlistItem(owner, itemId);
    sendSuccess(res, 200, 'Wishlist item removed successfully');
  } catch (error) {
    next(error);
  }
}

export async function clearWishlistHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const owner = getOwner(req);
    await wishlistService.clearWishlist(owner);
    sendSuccess(res, 200, 'Wishlist cleared successfully');
  } catch (error) {
    next(error);
  }
}

export async function checkWishlistStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const owner = getOwner(req);
    const productId = Array.isArray(req.params.productId)
      ? req.params.productId[0]
      : req.params.productId;

    const result = await wishlistService.checkWishlistStatus(owner, productId);
    sendSuccess(res, 200, 'Wishlist status checked successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function mergeWishlistHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const guestId =
      req.body?.guestId ||
      req.guestId ||
      (req.headers['x-guest-id'] as string) ||
      (req.headers['guest-id'] as string);

    if (!guestId) {
      sendError(res, 400, 'guestId is required to merge wishlist');
      return;
    }

    const result = await wishlistService.mergeGuestWishlist(userId, guestId);
    sendSuccess(res, 200, 'Guest wishlist merged successfully', result);
  } catch (error) {
    next(error);
  }
}
