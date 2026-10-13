import { prisma } from '../config/database';
import { AppError } from '../middleware/error.middleware';

export interface CartOwner {
  userId?: string;
  guestId?: string;
}

export interface AddToCartInput {
  productId: string;
  variantId?: string;
  quantity: number;
}

async function getOrCreateCart(tx: any, owner: CartOwner) {
  if (owner.userId) {
    let cart = await tx.cart.findUnique({
      where: { userId: owner.userId },
    });
    if (!cart) {
      cart = await tx.cart.create({
        data: { userId: owner.userId },
      });
    }
    return cart;
  }

  if (owner.guestId) {
    let cart = await tx.cart.findUnique({
      where: { guestId: owner.guestId },
    });
    if (!cart) {
      cart = await tx.cart.create({
        data: { guestId: owner.guestId },
      });
    }
    return cart;
  }

  throw new AppError('Cart owner identifier (userId or guestId) is required', 400);
}

export async function addToCart(owner: CartOwner, input: AddToCartInput) {
  // Validate product existence
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { variants: true },
  });

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  // Variant validation
  const productHasVariants = product.variants && product.variants.length > 0;
  let availableStock = 0;
  let selectedVariantId: string | null = null;

  if (productHasVariants) {
    if (!input.variantId) {
      throw new AppError('Variant ID is required for this product', 422);
    }
    const variant = product.variants.find((v) => v.id === input.variantId);
    if (!variant) {
      throw new AppError('Invalid variant ID for this product', 422);
    }
    selectedVariantId = variant.id;
    availableStock = variant.stock;
  } else {
    if (input.variantId) {
      throw new AppError('Product does not have variants. variantId must be omitted', 422);
    }
    availableStock = product.stock;
  }

  return await prisma.$transaction(async (tx) => {
    const cart = await getOrCreateCart(tx, owner);

    // Find existing cart item
    const existingItem = await tx.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId: input.productId,
        variantId: selectedVariantId,
      },
    });

    const currentQtyInCart = existingItem ? existingItem.quantity : 0;
    const requestedTotalQty = currentQtyInCart + input.quantity;

    if (requestedTotalQty > availableStock) {
      throw new AppError('Requested quantity exceeds available stock', 422);
    }

    if (existingItem) {
      await tx.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: requestedTotalQty },
      });
    } else {
      await tx.cartItem.create({
        data: {
          cartId: cart.id,
          productId: input.productId,
          variantId: selectedVariantId,
          quantity: input.quantity,
        },
      });
    }

    return getCart(owner, tx);
  });
}

export async function getCart(owner: CartOwner, tx: any = prisma) {
  let cart: any = null;

  if (owner.userId) {
    cart = await tx.cart.findUnique({
      where: { userId: owner.userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                media: {
                  select: { id: true, type: true, url: true, sortOrder: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
            variant: {
              select: { id: true, size: true, stock: true },
            },
          },
          orderBy: { createdAt: 'asc' },
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
                media: {
                  select: { id: true, type: true, url: true, sortOrder: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
            variant: {
              select: { id: true, size: true, stock: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  if (!cart) {
    return {
      cartId: null,
      guestId: owner.guestId || null,
      items: [],
      totalItems: 0,
      subtotal: 0,
    };
  }

  let subtotal = 0;
  let totalItems = 0;

  const formattedItems = cart.items.map((item: any) => {
    const sellPrice = Number(item.product.sellPrice);
    const itemSubtotal = sellPrice * item.quantity;
    const availableStock = item.variant ? item.variant.stock : item.product.stock;

    subtotal += itemSubtotal;
    totalItems += item.quantity;

    return {
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      subtotal: itemSubtotal,
      availableStock,
      product: {
        id: item.product.id,
        name: item.product.name,
        color: item.product.color,
        gst: Number(item.product.gst),
        description: item.product.description,
        basePrice: Number(item.product.basePrice),
        sellPrice: sellPrice,
        stock: item.product.stock,
        media: item.product.media,
      },
      variant: item.variant
        ? {
            id: item.variant.id,
            size: item.variant.size,
            stock: item.variant.stock,
          }
        : null,
    };
  });

  return {
    cartId: cart.id,
    guestId: owner.guestId || null,
    items: formattedItems,
    totalItems,
    subtotal,
  };
}

export async function updateCartItem(owner: CartOwner, itemId: string, quantity: number) {
  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    include: {
      cart: true,
      product: true,
      variant: true,
    },
  });

  if (!item) {
    throw new AppError('Cart item not found', 404);
  }

  // Verify ownership
  if (owner.userId && item.cart.userId !== owner.userId) {
    throw new AppError('Cart item not found or unauthorized', 404);
  }
  if (!owner.userId && owner.guestId && item.cart.guestId !== owner.guestId) {
    throw new AppError('Cart item not found or unauthorized', 404);
  }

  const availableStock = item.variant ? item.variant.stock : item.product.stock;

  if (quantity > availableStock) {
    throw new AppError('Requested quantity exceeds available stock', 422);
  }

  await prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
  });

  return getCart(owner);
}

export async function removeCartItem(owner: CartOwner, itemId: string) {
  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    include: { cart: true },
  });

  if (!item) {
    throw new AppError('Cart item not found', 404);
  }

  // Verify ownership
  if (owner.userId && item.cart.userId !== owner.userId) {
    throw new AppError('Cart item not found or unauthorized', 404);
  }
  if (!owner.userId && owner.guestId && item.cart.guestId !== owner.guestId) {
    throw new AppError('Cart item not found or unauthorized', 404);
  }

  await prisma.cartItem.delete({
    where: { id: itemId },
  });
}

export async function clearCart(owner: CartOwner) {
  let cart: any = null;

  if (owner.userId) {
    cart = await prisma.cart.findUnique({ where: { userId: owner.userId } });
  } else if (owner.guestId) {
    cart = await prisma.cart.findUnique({ where: { guestId: owner.guestId } });
  }

  if (cart) {
    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });
  }
}

export async function checkCartItem(owner: CartOwner, productId: string, variantId?: string) {
  let cart: any = null;

  if (owner.userId) {
    cart = await prisma.cart.findUnique({ where: { userId: owner.userId } });
  } else if (owner.guestId) {
    cart = await prisma.cart.findUnique({ where: { guestId: owner.guestId } });
  }

  if (!cart) {
    return { inCart: false, quantity: 0 };
  }

  const item = await prisma.cartItem.findFirst({
    where: {
      cartId: cart.id,
      productId,
      variantId: variantId ?? null,
    },
  });

  return {
    inCart: !!item,
    quantity: item ? item.quantity : 0,
  };
}

export async function mergeGuestCart(userId: string, guestId: string) {
  return await prisma.$transaction(async (tx) => {
    const guestCart = await tx.cart.findUnique({
      where: { guestId },
      include: {
        items: {
          include: {
            product: true,
            variant: true,
          },
        },
      },
    });

    if (!guestCart || guestCart.items.length === 0) {
      if (guestCart) {
        await tx.cart.delete({ where: { id: guestCart.id } });
      }
      const currentCart = await getCart({ userId }, tx);
      return {
        merged: true,
        adjustedItems: [],
        cart: currentCart,
      };
    }

    const userCart = await getOrCreateCart(tx, { userId });
    const adjustedItems: any[] = [];

    for (const guestItem of guestCart.items) {
      const availableStock = guestItem.variant ? guestItem.variant.stock : guestItem.product.stock;

      const userItem = await tx.cartItem.findFirst({
        where: {
          cartId: userCart.id,
          productId: guestItem.productId,
          variantId: guestItem.variantId,
        },
      });

      if (userItem) {
        const desiredQuantity = userItem.quantity + guestItem.quantity;
        const finalQuantity = Math.min(desiredQuantity, availableStock);

        if (finalQuantity < desiredQuantity) {
          adjustedItems.push({
            productId: guestItem.productId,
            variantId: guestItem.variantId,
            originalQuantity: desiredQuantity,
            mergedQuantity: finalQuantity,
            reason: 'Quantity reduced because available stock was lower',
          });
        }

        await tx.cartItem.update({
          where: { id: userItem.id },
          data: { quantity: finalQuantity },
        });
      } else {
        const finalQuantity = Math.min(guestItem.quantity, availableStock);

        if (finalQuantity < guestItem.quantity) {
          adjustedItems.push({
            productId: guestItem.productId,
            variantId: guestItem.variantId,
            originalQuantity: guestItem.quantity,
            mergedQuantity: finalQuantity,
            reason: 'Quantity reduced because available stock was lower',
          });
        }

        if (finalQuantity > 0) {
          await tx.cartItem.create({
            data: {
              cartId: userCart.id,
              productId: guestItem.productId,
              variantId: guestItem.variantId,
              quantity: finalQuantity,
            },
          });
        }
      }
    }

    // Delete guest cart & items
    await tx.cart.delete({ where: { id: guestCart.id } });

    const finalCart = await getCart({ userId }, tx);

    return {
      merged: true,
      adjustedItems,
      cart: finalCart,
    };
  });
}
