import { prisma } from '../config/database';
import { AppError } from '../middleware/error.middleware';

export async function createCategory(name: string) {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new AppError('Category name cannot be empty', 400);
  }

  const existing = await prisma.category.findUnique({
    where: { name: trimmedName },
  });

  if (existing) {
    throw new AppError('Category with this name already exists', 409);
  }

  return await prisma.category.create({
    data: { name: trimmedName },
  });
}

export async function getAdminCategories(page = 1, limit = 20, search?: string) {
  const skip = (page - 1) * limit;

  const where: any = {};
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    }),
    prisma.category.count({ where }),
  ]);

  return {
    categories,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getCategoryById(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: {
      _count: {
        select: { products: true },
      },
    },
  });

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  return category;
}

export async function updateCategory(id: string, name: string) {
  const category = await prisma.category.findUnique({
    where: { id },
  });

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new AppError('Category name cannot be empty', 400);
  }

  if (trimmedName !== category.name) {
    const existing = await prisma.category.findUnique({
      where: { name: trimmedName },
    });

    if (existing) {
      throw new AppError('Category with this name already exists', 409);
    }
  }

  return await prisma.category.update({
    where: { id },
    data: { name: trimmedName },
  });
}

export async function deleteCategory(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
  });

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  const productCount = await prisma.product.count({
    where: { categoryId: id },
  });

  if (productCount > 0) {
    throw new AppError('Category cannot be deleted because products are associated with it', 409);
  }

  await prisma.category.delete({
    where: { id },
  });
}

export async function getPublicCategories(page = 1, limit = 20, search?: string) {
  const skip = (page - 1) * limit;

  const where: any = {};
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.category.count({ where }),
  ]);

  return {
    categories,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getPublicCategoryById(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      createdAt: true,
      products: {
        select: {
          id: true,
          name: true,
          color: true,
          gst: true,
          basePrice: true,
          sellPrice: true,
          stock: true,
          media: {
            select: { type: true, url: true, sortOrder: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  return category;
}
