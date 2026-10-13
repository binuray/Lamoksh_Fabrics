import { Request, Response, NextFunction } from 'express';
import * as cartService from '../services/cart.service';
import { sendSuccess, sendError } from '../utils/response';

function getOwner(req: Request): cartService.CartOwner {
  return {
    userId: req.user?.id,
    guestId: req.user ? undefined : req.guestId,
  };
}

export async function addToCartHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const owner = getOwner(req);
    const cart = await cartService.addToCart(owner, req.body);
    sendSuccess(res, 201, 'Cart item added successfully', {
      cart,
      guestId: req.user ? undefined : req.guestId,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCartHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const owner = getOwner(req);
    const cart = await cartService.getCart(owner);
    sendSuccess(res, 200, 'Cart retrieved successfully', {
      cart,
      guestId: req.user ? undefined : req.guestId,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCartItemHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const owner = getOwner(req);
    const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
    const cart = await cartService.updateCartItem(owner, itemId, req.body.quantity);
    sendSuccess(res, 200, 'Cart item updated successfully', { cart });
  } catch (error) {
    next(error);
  }
}

export async function removeCartItemHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const owner = getOwner(req);
    const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
    await cartService.removeCartItem(owner, itemId);
    sendSuccess(res, 200, 'Cart item removed successfully');
  } catch (error) {
    next(error);
  }
}

export async function clearCartHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const owner = getOwner(req);
    await cartService.clearCart(owner);
    sendSuccess(res, 200, 'Cart cleared successfully');
  } catch (error) {
    next(error);
  }
}

export async function checkCartItemHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const owner = getOwner(req);
    const productId = req.query.productId as string;
    const variantId = req.query.variantId as string | undefined;

    if (!productId) {
      sendError(res, 400, 'productId query parameter is required');
      return;
    }

    const result = await cartService.checkCartItem(owner, productId, variantId);
    sendSuccess(res, 200, 'Cart item checked successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function mergeCartHandler(
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
      sendError(res, 400, 'guestId is required to merge cart');
      return;
    }

    const result = await cartService.mergeGuestCart(userId, guestId);
    sendSuccess(res, 200, 'Guest cart merged successfully', result);
  } catch (error) {
    next(error);
  }
}
