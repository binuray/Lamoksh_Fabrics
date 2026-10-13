import { prisma } from '../config/database';
import { AppError } from '../middleware/error.middleware';

export interface WishlistOwner {
  userId?: string;
  guestId?: string;
}

async function getOrCreateWishlist(tx: any, owner: WishlistOwner) {
  if (owner.userId) {
    let wishlist = await tx.wishlist.findUnique({
      where: { userId: owner.userId },
    });
    if (!wishlist) {
      wishlist = await tx.wishlist.create({
        data: { userId: owner.userId },
      });
    }
    return wishlist;
  }

  if (owner.guestId) {
    let wishlist = await tx.wishlist.findUnique({
      where: { guestId: owner.guestId },
    });
    if (!wishlist) {
      wishlist = await tx.wishlist.create({
        data: { guestId: owner.guestId },
      });
    }
    return wishlist;
  }

  throw new AppError('Wishlist owner identifier (userId or guestId) is required', 400);
}

export async function addToWishlist(owner: WishlistOwner, productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  return await prisma.$transaction(async (tx) => {
    const wishlist = await getOrCreateWishlist(tx, owner);

    const existingItem = await tx.wishlistItem.findFirst({
      where: {
        wishlistId: wishlist.id,
        productId,
      },
    });

    if (existingItem) {
      return {
        alreadyInWishlist: true,
        message: 'Product is already in wishlist',
        item: existingItem,
      };
    }

    const newItem = await tx.wishlistItem.create({
      data: {
        wishlistId: wishlist.id,
        productId,
      },
    });

    return {
      alreadyInWishlist: false,
      message: 'Product added to wishlist successfully',
      item: newItem,
    };
  });
}

export async function getWishlist(owner: WishlistOwner, tx: any = prisma) {
  let wishlist: any = null;

  if (owner.userId) {
    wishlist = await tx.wishlist.findUnique({
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
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  } else if (owner.guestId) {
    wishlist = await tx.wishlist.findUnique({
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
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  if (!wishlist) {
    return {
      wishlistId: null,
      guestId: owner.guestId || null,
      items: [],
      totalItems: 0,
    };
  }

  const formattedItems = wishlist.items.map((item: any) => ({
    id: item.id,
    productId: item.productId,
    createdAt: item.createdAt,
    product: {
      id: item.product.id,
      name: item.product.name,
      color: item.product.color,
      gst: Number(item.product.gst),
      description: item.product.description,
      basePrice: Number(item.product.basePrice),
      sellPrice: Number(item.product.sellPrice),
      stock: item.product.stock,
      media: item.product.media,
    },
  }));

  return {
    wishlistId: wishlist.id,
    guestId: owner.guestId || null,
    items: formattedItems,
    totalItems: formattedItems.length,
  };
}

export async function removeWishlistItem(owner: WishlistOwner, itemId: string) {
  const item = await prisma.wishlistItem.findUnique({
    where: { id: itemId },
    include: { wishlist: true },
  });

  if (!item) {
    throw new AppError('Wishlist item not found', 404);
  }

  // Verify ownership
  if (owner.userId && item.wishlist.userId !== owner.userId) {
    throw new AppError('Wishlist item not found or unauthorized', 404);
  }
  if (!owner.userId && owner.guestId && item.wishlist.guestId !== owner.guestId) {
    throw new AppError('Wishlist item not found or unauthorized', 404);
  }

  await prisma.wishlistItem.delete({
    where: { id: itemId },
  });
}

export async function clearWishlist(owner: WishlistOwner) {
  let wishlist: any = null;

  if (owner.userId) {
    wishlist = await prisma.wishlist.findUnique({ where: { userId: owner.userId } });
  } else if (owner.guestId) {
    wishlist = await prisma.wishlist.findUnique({ where: { guestId: owner.guestId } });
  }

  if (wishlist) {
    await prisma.wishlistItem.deleteMany({
      where: { wishlistId: wishlist.id },
    });
  }
}

export async function checkWishlistStatus(owner: WishlistOwner, productId: string) {
  let wishlist: any = null;

  if (owner.userId) {
    wishlist = await prisma.wishlist.findUnique({ where: { userId: owner.userId } });
  } else if (owner.guestId) {
    wishlist = await prisma.wishlist.findUnique({ where: { guestId: owner.guestId } });
  }

  if (!wishlist) {
    return { productId, isWishlisted: false };
  }

  const item = await prisma.wishlistItem.findFirst({
    where: {
      wishlistId: wishlist.id,
      productId,
    },
  });

  return {
    productId,
    isWishlisted: !!item,
  };
}

export async function mergeGuestWishlist(userId: string, guestId: string) {
  return await prisma.$transaction(async (tx) => {
    const guestWishlist = await tx.wishlist.findUnique({
      where: { guestId },
      include: { items: true },
    });

    if (!guestWishlist || guestWishlist.items.length === 0) {
      if (guestWishlist) {
        await tx.wishlist.delete({ where: { id: guestWishlist.id } });
      }
      const currentWishlist = await getWishlist({ userId }, tx);
      return {
        merged: true,
        wishlist: currentWishlist,
      };
    }

    const userWishlist = await getOrCreateWishlist(tx, { userId });

    for (const guestItem of guestWishlist.items) {
      const existingItem = await tx.wishlistItem.findFirst({
        where: {
          wishlistId: userWishlist.id,
          productId: guestItem.productId,
        },
      });

      if (!existingItem) {
        await tx.wishlistItem.create({
          data: {
            wishlistId: userWishlist.id,
            productId: guestItem.productId,
          },
        });
      }
    }

    // Delete guest wishlist & items
    await tx.wishlist.delete({ where: { id: guestWishlist.id } });

    const finalWishlist = await getWishlist({ userId }, tx);

    return {
      merged: true,
      wishlist: finalWishlist,
    };
  });
}
