import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { getStorageService } from './storage.service';

export interface VariantInput {
  size: string;
  stock: number;
}

export interface CreateProductInput {
  name: string;
  categoryId: string;
  color: string;
  gst: number;
  description: string;
  basePrice: number;
  sellPrice: number;
  stock: number;
  variants?: VariantInput[];
}

export interface UpdateProductInput {
  name?: string;
  categoryId?: string;
  color?: string;
  gst?: number;
  description?: string;
  basePrice?: number;
  sellPrice?: number;
  stock?: number;
  variants?: VariantInput[];
  existingMediaIds?: string[];
  removeMediaIds?: string[];
}

export async function createProduct(
  data: CreateProductInput,
  imageFiles: Express.Multer.File[] = [],
  videoFiles: Express.Multer.File[] = []
) {
  // Validate category
  const category = await prisma.category.findUnique({
    where: { id: data.categoryId },
  });

  if (!category) {
    throw new AppError('Invalid categoryId. Category does not exist', 400);
  }

  // Validate media counts
  const imageCount = imageFiles.length;
  const videoCount = videoFiles.length;
  const totalMedia = imageCount + videoCount;

  if (totalMedia < 1) {
    throw new AppError('At least 1 media file (image/video) is mandatory for a product', 400);
  }

  if (imageCount > 5) {
    throw new AppError('Maximum 5 images allowed per product', 400);
  }

  if (videoCount > 2) {
    throw new AppError('Maximum 2 videos allowed per product', 400);
  }

  if (totalMedia > 7) {
    throw new AppError('Maximum 7 total media files allowed per product', 400);
  }

  // Validate price rule
  if (data.sellPrice > data.basePrice) {
    throw new AppError('Product sellPrice cannot be greater than basePrice', 400);
  }

  // Upload files to storage
  const storage = getStorageService();
  const uploadedMedia: { type: 'IMAGE' | 'VIDEO'; url: string; key: string; sortOrder: number }[] = [];

  try {
    let sortOrder = 0;

    for (const file of imageFiles) {
      const res = await storage.uploadFile(file, 'images');
      uploadedMedia.push({ type: 'IMAGE', url: res.url, key: res.key, sortOrder: sortOrder++ });
    }

    for (const file of videoFiles) {
      const res = await storage.uploadFile(file, 'videos');
      uploadedMedia.push({ type: 'VIDEO', url: res.url, key: res.key, sortOrder: sortOrder++ });
    }

    // Execute Prisma transaction
    const newProduct = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: data.name.trim(),
          categoryId: data.categoryId,
          color: data.color.trim(),
          gst: new Prisma.Decimal(data.gst),
          description: data.description.trim(),
          basePrice: new Prisma.Decimal(data.basePrice),
          sellPrice: new Prisma.Decimal(data.sellPrice),
          stock: data.stock,
        },
      });

      const variants = data.variants || [];
      if (variants.length > 0) {
        await tx.productVariant.createMany({
          data: variants.map((v) => ({
            productId: product.id,
            size: v.size.trim(),
            stock: v.stock,
          })),
        });
      }

      if (uploadedMedia.length > 0) {
        await tx.productMedia.createMany({
          data: uploadedMedia.map((m) => ({
            productId: product.id,
            type: m.type,
            url: m.url,
            storageKey: m.key,
            sortOrder: m.sortOrder,
          })),
        });
      }

      return product;
    });

    return getProductById(newProduct.id);
  } catch (error) {
    // Clean up uploaded files if DB transaction fails
    for (const m of uploadedMedia) {
      await storage.deleteFile(m.key);
    }
    throw error;
  }
}

export async function getAdminProducts(
  page = 1,
  limit = 20,
  search?: string,
  categoryId?: string,
  minPrice?: number,
  maxPrice?: number,
  sortBy = 'createdAt',
  sortOrder: 'asc' | 'desc' = 'desc'
) {
  const skip = (page - 1) * limit;

  const where: any = {};

  if (categoryId) {
    where.categoryId = categoryId;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { color: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.sellPrice = {};
    if (minPrice !== undefined) where.sellPrice.gte = new Prisma.Decimal(minPrice);
    if (maxPrice !== undefined) where.sellPrice.lte = new Prisma.Decimal(maxPrice);
  }

  const validSortFields = ['createdAt', 'name', 'basePrice', 'sellPrice', 'stock'];
  const orderByField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [orderByField]: sortOrder },
      include: {
        category: {
          select: { id: true, name: true },
        },
        variants: {
          select: { id: true, size: true, stock: true },
          orderBy: { size: 'asc' },
        },
        media: {
          select: { id: true, type: true, url: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: {
        select: { id: true, name: true },
      },
      variants: {
        select: { id: true, size: true, stock: true },
        orderBy: { size: 'asc' },
      },
      media: {
        select: { id: true, type: true, url: true, storageKey: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  return product;
}

export async function updateProduct(
  id: string,
  data: UpdateProductInput,
  newImageFiles: Express.Multer.File[] = [],
  newVideoFiles: Express.Multer.File[] = []
) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { media: true, variants: true },
  });

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  // Validate category if changing
  if (data.categoryId && data.categoryId !== product.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) {
      throw new AppError('Invalid categoryId. Category does not exist', 400);
    }
  }

  // Validate price rule
  const finalBasePrice = data.basePrice !== undefined ? data.basePrice : Number(product.basePrice);
  const finalSellPrice = data.sellPrice !== undefined ? data.sellPrice : Number(product.sellPrice);

  if (finalSellPrice > finalBasePrice) {
    throw new AppError('Product sellPrice cannot be greater than basePrice', 400);
  }

  // Media calculations
  const removeIds = data.removeMediaIds || [];
  const retainedMedia = product.media.filter((m) => !removeIds.includes(m.id));

  const retainedImagesCount = retainedMedia.filter((m) => m.type === 'IMAGE').length;
  const retainedVideosCount = retainedMedia.filter((m) => m.type === 'VIDEO').length;

  const totalImages = retainedImagesCount + newImageFiles.length;
  const totalVideos = retainedVideosCount + newVideoFiles.length;
  const totalMedia = totalImages + totalVideos;

  if (totalImages > 5) {
    throw new AppError(`Updating would result in ${totalImages} images. Maximum allowed is 5 images`, 400);
  }

  if (totalVideos > 2) {
    throw new AppError(`Updating would result in ${totalVideos} videos. Maximum allowed is 2 videos`, 400);
  }

  if (totalMedia < 1) {
    throw new AppError('Product must have at least 1 media file', 400);
  }

  if (totalMedia > 7) {
    throw new AppError(`Updating would result in ${totalMedia} media files. Maximum allowed is 7 media files`, 400);
  }

  // Upload new files
  const storage = getStorageService();
  const newlyUploadedMedia: { type: 'IMAGE' | 'VIDEO'; url: string; key: string; sortOrder: number }[] = [];

  try {
    let maxSortOrder = retainedMedia.reduce((max, m) => Math.max(max, m.sortOrder), -1);

    for (const file of newImageFiles) {
      const res = await storage.uploadFile(file, 'images');
      newlyUploadedMedia.push({ type: 'IMAGE', url: res.url, key: res.key, sortOrder: ++maxSortOrder });
    }

    for (const file of newVideoFiles) {
      const res = await storage.uploadFile(file, 'videos');
      newlyUploadedMedia.push({ type: 'VIDEO', url: res.url, key: res.key, sortOrder: ++maxSortOrder });
    }

    // Execute Prisma transaction
    await prisma.$transaction(async (tx) => {
      // 1. Update product main fields
      await tx.product.update({
        where: { id },
        data: {
          name: data.name ? data.name.trim() : undefined,
          categoryId: data.categoryId ? data.categoryId : undefined,
          color: data.color ? data.color.trim() : undefined,
          gst: data.gst !== undefined ? new Prisma.Decimal(data.gst) : undefined,
          description: data.description ? data.description.trim() : undefined,
          basePrice: data.basePrice !== undefined ? new Prisma.Decimal(data.basePrice) : undefined,
          sellPrice: data.sellPrice !== undefined ? new Prisma.Decimal(data.sellPrice) : undefined,
          stock: data.stock !== undefined ? data.stock : undefined,
        },
      });

      // 2. Delete removed ProductMedia records
      if (removeIds.length > 0) {
        await tx.productMedia.deleteMany({
          where: { id: { in: removeIds }, productId: id },
        });
      }

      // 3. Insert newly uploaded ProductMedia records
      if (newlyUploadedMedia.length > 0) {
        await tx.productMedia.createMany({
          data: newlyUploadedMedia.map((m) => ({
            productId: id,
            type: m.type,
            url: m.url,
            storageKey: m.key,
            sortOrder: m.sortOrder,
          })),
        });
      }

      // 4. Update variants if provided
      if (data.variants !== undefined) {
        await tx.productVariant.deleteMany({ where: { productId: id } });
        if (data.variants.length > 0) {
          await tx.productVariant.createMany({
            data: data.variants.map((v) => ({
              productId: id,
              size: v.size.trim(),
              stock: v.stock,
            })),
          });
        }
      }
    });

    // Clean up physical storage for removed media
    const removedMediaFiles = product.media.filter((m) => removeIds.includes(m.id));
    for (const m of removedMediaFiles) {
      await storage.deleteFile(m.storageKey);
    }

    return getProductById(id);
  } catch (error) {
    // Clean up newly uploaded files on transaction error
    for (const m of newlyUploadedMedia) {
      await storage.deleteFile(m.key);
    }
    throw error;
  }
}

export async function deleteProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { media: true },
  });

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  // Transaction to delete DB records
  await prisma.$transaction(async (tx) => {
    await tx.productVariant.deleteMany({ where: { productId: id } });
    await tx.productMedia.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });
  });

  // Delete storage files
  const storage = getStorageService();
  for (const m of product.media) {
    await storage.deleteFile(m.storageKey);
  }
}

export async function getPublicProducts(
  page = 1,
  limit = 20,
  search?: string,
  categoryId?: string,
  minPrice?: number,
  maxPrice?: number,
  sortBy = 'createdAt',
  sortOrder: 'asc' | 'desc' = 'desc'
) {
  const skip = (page - 1) * limit;

  const where: any = {};

  if (categoryId) {
    where.categoryId = categoryId;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { color: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.sellPrice = {};
    if (minPrice !== undefined) where.sellPrice.gte = new Prisma.Decimal(minPrice);
    if (maxPrice !== undefined) where.sellPrice.lte = new Prisma.Decimal(maxPrice);
  }

  const validSortFields = ['createdAt', 'name', 'sellPrice', 'stock'];
  const orderByField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [orderByField]: sortOrder },
      select: {
        id: true,
        name: true,
        color: true,
        gst: true,
        description: true,
        basePrice: true,
        sellPrice: true,
        stock: true,
        createdAt: true,
        category: {
          select: { id: true, name: true },
        },
        variants: {
          select: { id: true, size: true, stock: true },
          orderBy: { size: 'asc' },
        },
        media: {
          select: { id: true, type: true, url: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getPublicProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      color: true,
      gst: true,
      description: true,
      basePrice: true,
      sellPrice: true,
      stock: true,
      createdAt: true,
      category: {
        select: { id: true, name: true },
      },
      variants: {
        select: { id: true, size: true, stock: true },
        orderBy: { size: 'asc' },
      },
      media: {
        select: { id: true, type: true, url: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  return product;
}
