import { BlogStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { getStorageService } from './storage.service';
import { generateUniqueSlug } from '../utils/slug';
import { sanitizeBlogContent } from '../utils/sanitize';
import { AuthUser } from '../middleware/auth.middleware';

export interface CreateBlogInput {
  title: string;
  slug?: string;
  description: string;
  content: string;
  category: string;
  tags?: string[];
  author?: string;
  seoTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  status?: BlogStatus;
  featuredImageAlt?: string;
  imageAltTexts?: string[];
}

export interface UpdateBlogInput {
  title?: string;
  slug?: string;
  description?: string;
  content?: string;
  category?: string;
  tags?: string[];
  author?: string;
  seoTitle?: string | null;
  metaDescription?: string | null;
  keywords?: string[];
  status?: BlogStatus;
  featuredImageAlt?: string | null;
  removeFeaturedImage?: boolean;
  removeImageIds?: string[];
  imageAltTexts?: string[];
}

export interface BlogFilterOptions {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  tag?: string;
  status?: BlogStatus;
  sortBy?: 'createdAt' | 'updatedAt' | 'publishedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Creates a new blog post.
 */
export async function createBlog(
  data: CreateBlogInput,
  files?: {
    featuredImage?: Express.Multer.File[];
    images?: Express.Multer.File[];
  },
  currentUser?: AuthUser
) {
  const storage = getStorageService();
  const newlyUploadedKeys: string[] = [];

  let featuredImageUrl: string | null = null;
  let featuredImageKey: string | null = null;
  let featuredImageAlt: string | null = data.featuredImageAlt || null;

  try {
    // 1. Handle featured image upload
    const featuredFile = files?.featuredImage?.[0];
    if (featuredFile) {
      const res = await storage.uploadFile(featuredFile, 'featured', 'blogs');
      newlyUploadedKeys.push(res.key);
      featuredImageUrl = res.url;
      featuredImageKey = res.key;
      featuredImageAlt = data.featuredImageAlt?.trim() || data.title.trim();
    }

    // 2. Handle gallery/content images upload
    const galleryFiles = files?.images || [];
    const uploadedGalleryImages: { url: string; key: string; altText: string }[] = [];

    for (let i = 0; i < galleryFiles.length; i++) {
      const file = galleryFiles[i];
      const res = await storage.uploadFile(file, 'images', 'blogs');
      newlyUploadedKeys.push(res.key);
      const alt = data.imageAltTexts?.[i] || `${data.title.trim()} image ${i + 1}`;
      uploadedGalleryImages.push({
        url: res.url,
        key: res.key,
        altText: alt,
      });
    }

    // 3. Generate unique SEO slug
    const slug = await generateUniqueSlug(data.slug || data.title);

    // 4. Sanitize HTML content
    const sanitizedContent = sanitizeBlogContent(data.content);

    // 5. Author info
    const authorName = data.author?.trim() || currentUser?.name || 'Admin';
    const authorId = currentUser?.id || null;

    // 6. Publication status and timestamp
    const status = data.status || BlogStatus.DRAFT;
    const publishedAt = status === BlogStatus.PUBLISHED ? new Date() : null;

    // 7. Save to database in a transaction
    const blog = await prisma.$transaction(async (tx) => {
      const createdBlog = await tx.blog.create({
        data: {
          title: data.title.trim(),
          slug,
          description: data.description.trim(),
          content: sanitizedContent,
          category: data.category.trim(),
          tags: data.tags || [],
          author: authorName,
          authorId,
          seoTitle: data.seoTitle?.trim() || data.title.trim(),
          metaDescription: data.metaDescription?.trim() || data.description.trim(),
          keywords: data.keywords || [],
          featuredImage: featuredImageUrl,
          featuredImageKey: featuredImageKey,
          featuredImageAlt: featuredImageAlt,
          status,
          publishedAt,
        },
      });

      if (uploadedGalleryImages.length > 0) {
        await tx.blogImage.createMany({
          data: uploadedGalleryImages.map((img) => ({
            blogId: createdBlog.id,
            url: img.url,
            storageKey: img.key,
            altText: img.altText,
          })),
        });
      }

      return createdBlog;
    });

    return getBlogById(blog.id);
  } catch (error) {
    // Clean up uploaded files if database creation fails
    for (const key of newlyUploadedKeys) {
      await storage.deleteFile(key);
    }
    throw error;
  }
}

/**
 * Retrieves paginated blogs for admin management.
 */
export async function getAdminBlogs(options: BlogFilterOptions = {}) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 10));
  const skip = (page - 1) * limit;

  const where: Prisma.BlogWhereInput = {};

  if (options.status) {
    where.status = options.status;
  }

  if (options.category) {
    where.category = { equals: options.category.trim(), mode: 'insensitive' };
  }

  if (options.tag) {
    where.tags = { has: options.tag.trim() };
  }

  if (options.search) {
    const search = options.search.trim();
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { content: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
      { author: { contains: search, mode: 'insensitive' } },
    ];
  }

  const validSortFields = ['createdAt', 'updatedAt', 'publishedAt', 'title'];
  const sortBy = validSortFields.includes(options.sortBy || '') ? options.sortBy! : 'createdAt';
  const sortOrder = options.sortOrder === 'asc' ? 'asc' : 'desc';

  const [blogs, total] = await Promise.all([
    prisma.blog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        images: {
          select: { id: true, url: true, storageKey: true, altText: true, isFeatured: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.blog.count({ where }),
  ]);

  return {
    blogs,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Retrieves a single blog by ID or slug.
 */
export async function getBlogById(identifier: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  const blog = await prisma.blog.findFirst({
    where: isUuid ? { OR: [{ id: identifier }, { slug: identifier }] } : { slug: identifier },
    include: {
      images: {
        select: { id: true, url: true, storageKey: true, altText: true, isFeatured: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
      authorUser: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!blog) {
    throw new AppError('Blog not found', 404);
  }

  return blog;
}

/**
 * Updates an existing blog post.
 */
export async function updateBlog(
  id: string,
  data: UpdateBlogInput,
  files?: {
    featuredImage?: Express.Multer.File[];
    images?: Express.Multer.File[];
  }
) {
  const blog = await prisma.blog.findUnique({
    where: { id },
    include: { images: true },
  });

  if (!blog) {
    throw new AppError('Blog not found', 404);
  }

  const storage = getStorageService();
  const newlyUploadedKeys: string[] = [];
  const filesToDelete: string[] = [];

  try {
    let featuredImageUrl = blog.featuredImage;
    let featuredImageKey = blog.featuredImageKey;
    let featuredImageAlt = blog.featuredImageAlt;

    // 1. Featured image replacement or removal
    const newFeaturedFile = files?.featuredImage?.[0];
    if (newFeaturedFile) {
      const res = await storage.uploadFile(newFeaturedFile, 'featured', 'blogs');
      newlyUploadedKeys.push(res.key);
      if (blog.featuredImageKey) {
        filesToDelete.push(blog.featuredImageKey);
      }
      featuredImageUrl = res.url;
      featuredImageKey = res.key;
      featuredImageAlt = data.featuredImageAlt !== undefined ? data.featuredImageAlt : (blog.featuredImageAlt || blog.title);
    } else if (data.removeFeaturedImage) {
      if (blog.featuredImageKey) {
        filesToDelete.push(blog.featuredImageKey);
      }
      featuredImageUrl = null;
      featuredImageKey = null;
      featuredImageAlt = null;
    } else if (data.featuredImageAlt !== undefined) {
      featuredImageAlt = data.featuredImageAlt;
    }

    // 2. Remove specified gallery images
    const removeImageIds = data.removeImageIds || [];
    if (removeImageIds.length > 0) {
      const imagesToRemove = blog.images.filter((img) => removeImageIds.includes(img.id));
      for (const img of imagesToRemove) {
        filesToDelete.push(img.storageKey);
      }
    }

    // 3. Upload new gallery images
    const newGalleryFiles = files?.images || [];
    const newlyAddedImages: { url: string; key: string; altText: string }[] = [];

    for (let i = 0; i < newGalleryFiles.length; i++) {
      const file = newGalleryFiles[i];
      const res = await storage.uploadFile(file, 'images', 'blogs');
      newlyUploadedKeys.push(res.key);
      const alt = data.imageAltTexts?.[i] || `${data.title || blog.title} image`;
      newlyAddedImages.push({
        url: res.url,
        key: res.key,
        altText: alt,
      });
    }

    // 4. Handle slug update (preserve SEO URL stability unless explicitly requested)
    let slug = blog.slug;
    if (data.slug && data.slug.trim() !== '' && data.slug.trim() !== blog.slug) {
      slug = await generateUniqueSlug(data.slug, blog.id);
    }

    // 5. Sanitize HTML content if updated
    const content = data.content !== undefined ? sanitizeBlogContent(data.content) : undefined;

    // 6. Handle status change & publication timestamp
    let status = data.status || blog.status;
    let publishedAt = blog.publishedAt;
    if (data.status === BlogStatus.PUBLISHED && blog.status !== BlogStatus.PUBLISHED) {
      publishedAt = new Date();
    } else if (data.status === BlogStatus.DRAFT) {
      // When explicitly set to draft, we can retain or clear publishedAt
    }

    // 7. Update in database transaction
    await prisma.$transaction(async (tx) => {
      await tx.blog.update({
        where: { id },
        data: {
          title: data.title ? data.title.trim() : undefined,
          slug,
          description: data.description ? data.description.trim() : undefined,
          content,
          category: data.category ? data.category.trim() : undefined,
          tags: data.tags !== undefined ? data.tags : undefined,
          author: data.author ? data.author.trim() : undefined,
          seoTitle: data.seoTitle !== undefined ? data.seoTitle?.trim() || null : undefined,
          metaDescription: data.metaDescription !== undefined ? data.metaDescription?.trim() || null : undefined,
          keywords: data.keywords !== undefined ? data.keywords : undefined,
          status,
          publishedAt,
          featuredImage: featuredImageUrl,
          featuredImageKey: featuredImageKey,
          featuredImageAlt: featuredImageAlt,
        },
      });

      if (removeImageIds.length > 0) {
        await tx.blogImage.deleteMany({
          where: { id: { in: removeImageIds }, blogId: id },
        });
      }

      if (newlyAddedImages.length > 0) {
        await tx.blogImage.createMany({
          data: newlyAddedImages.map((img) => ({
            blogId: id,
            url: img.url,
            storageKey: img.key,
            altText: img.altText,
          })),
        });
      }
    });

    // 8. Delete orphaned physical files
    for (const key of filesToDelete) {
      await storage.deleteFile(key);
    }

    return getBlogById(id);
  } catch (error) {
    // Clean up newly uploaded files on failure
    for (const key of newlyUploadedKeys) {
      await storage.deleteFile(key);
    }
    throw error;
  }
}

/**
 * Publishes a blog post.
 */
export async function publishBlog(id: string) {
  const blog = await prisma.blog.findUnique({ where: { id } });
  if (!blog) {
    throw new AppError('Blog not found', 404);
  }

  const updated = await prisma.blog.update({
    where: { id },
    data: {
      status: BlogStatus.PUBLISHED,
      publishedAt: blog.publishedAt || new Date(),
    },
    include: {
      images: true,
    },
  });

  return updated;
}

/**
 * Unpublishes a blog post (reverts status to DRAFT).
 */
export async function unpublishBlog(id: string) {
  const blog = await prisma.blog.findUnique({ where: { id } });
  if (!blog) {
    throw new AppError('Blog not found', 404);
  }

  const updated = await prisma.blog.update({
    where: { id },
    data: {
      status: BlogStatus.DRAFT,
    },
    include: {
      images: true,
    },
  });

  return updated;
}

/**
 * Deletes a blog post and its associated storage files.
 */
export async function deleteBlog(id: string) {
  const blog = await prisma.blog.findUnique({
    where: { id },
    include: { images: true },
  });

  if (!blog) {
    throw new AppError('Blog not found', 404);
  }

  // Delete from database (cascade deletes images)
  await prisma.blog.delete({ where: { id } });

  // Clean up physical storage
  const storage = getStorageService();
  if (blog.featuredImageKey) {
    await storage.deleteFile(blog.featuredImageKey);
  }
  for (const img of blog.images) {
    await storage.deleteFile(img.storageKey);
  }
}

/**
 * Uploads a single image for blog content (e.g. for rich text editor inline images).
 */
export async function uploadBlogImage(
  file: Express.Multer.File,
  altText?: string,
  blogId?: string
) {
  if (blogId) {
    const blog = await prisma.blog.findUnique({ where: { id: blogId } });
    if (!blog) {
      throw new AppError('Blog not found', 404);
    }
  }

  const storage = getStorageService();
  const res = await storage.uploadFile(file, 'content', 'blogs');

  const image = await prisma.blogImage.create({
    data: {
      blogId: blogId || null,
      url: res.url,
      storageKey: res.key,
      altText: altText || pathBasename(file.originalname),
    },
  });

  return image;
}

function pathBasename(filename: string): string {
  return filename.replace(/\\/g, '/').split('/').pop() || 'image';
}

/**
 * Updates an image's alt text or sets it as the featured image.
 */
export async function updateBlogImage(
  blogId: string,
  imageId: string,
  altText: string,
  isFeatured?: boolean
) {
  const image = await prisma.blogImage.findFirst({
    where: { id: imageId, blogId },
  });

  if (!image) {
    throw new AppError('Image not found for this blog', 404);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (isFeatured) {
      await tx.blogImage.updateMany({
        where: { blogId },
        data: { isFeatured: false },
      });
      await tx.blog.update({
        where: { id: blogId },
        data: {
          featuredImage: image.url,
          featuredImageKey: image.storageKey,
          featuredImageAlt: altText,
        },
      });
    }

    return tx.blogImage.update({
      where: { id: imageId },
      data: {
        altText,
        isFeatured: isFeatured !== undefined ? isFeatured : image.isFeatured,
      },
    });
  });

  return updated;
}

/**
 * Deletes a single image from a blog and storage.
 */
export async function deleteBlogImage(blogId: string, imageId: string) {
  const image = await prisma.blogImage.findFirst({
    where: { id: imageId, blogId },
  });

  if (!image) {
    throw new AppError('Image not found for this blog', 404);
  }

  await prisma.blogImage.delete({ where: { id: imageId } });

  const storage = getStorageService();
  await storage.deleteFile(image.storageKey);
}

/**
 * Public API: List published blogs.
 */
export async function getPublicBlogs(options: BlogFilterOptions = {}) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 10));
  const skip = (page - 1) * limit;

  const where: Prisma.BlogWhereInput = {
    status: BlogStatus.PUBLISHED,
  };

  if (options.category) {
    where.category = { equals: options.category.trim(), mode: 'insensitive' };
  }

  if (options.tag) {
    where.tags = { has: options.tag.trim() };
  }

  if (options.search) {
    const search = options.search.trim();
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
      { author: { contains: search, mode: 'insensitive' } },
    ];
  }

  const validSortFields = ['publishedAt', 'createdAt', 'title'];
  const sortBy = validSortFields.includes(options.sortBy || '') ? options.sortBy! : 'publishedAt';
  const sortOrder = options.sortOrder === 'asc' ? 'asc' : 'desc';

  const [blogs, total] = await Promise.all([
    prisma.blog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        category: true,
        tags: true,
        author: true,
        seoTitle: true,
        metaDescription: true,
        keywords: true,
        featuredImage: true,
        featuredImageAlt: true,
        publishedAt: true,
        createdAt: true,
        images: {
          select: { id: true, url: true, altText: true, isFeatured: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.blog.count({ where }),
  ]);

  return {
    blogs,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Public API: Get single published blog by slug or ID.
 */
export async function getPublicBlogBySlugOrId(identifier: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  const blog = await prisma.blog.findFirst({
    where: {
      status: BlogStatus.PUBLISHED,
      ...(isUuid ? { OR: [{ id: identifier }, { slug: identifier }] } : { slug: identifier }),
    },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      content: true,
      category: true,
      tags: true,
      author: true,
      seoTitle: true,
      metaDescription: true,
      keywords: true,
      featuredImage: true,
      featuredImageAlt: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      images: {
        select: { id: true, url: true, altText: true, isFeatured: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!blog) {
    throw new AppError('Blog not found or is not published', 404);
  }

  return blog;
}

/**
 * Get distinct categories of published blogs with their counts.
 */
export async function getBlogCategories(onlyPublished = true) {
  const where: Prisma.BlogWhereInput = onlyPublished ? { status: BlogStatus.PUBLISHED } : {};

  const categories = await prisma.blog.groupBy({
    by: ['category'],
    where,
    _count: {
      id: true,
    },
    orderBy: {
      category: 'asc',
    },
  });

  return categories.map((c) => ({
    category: c.category,
    count: c._count.id,
  }));
}

/**
 * Get all unique tags from published blogs.
 */
export async function getBlogTags(onlyPublished = true) {
  const where: Prisma.BlogWhereInput = onlyPublished ? { status: BlogStatus.PUBLISHED } : {};

  const blogs = await prisma.blog.findMany({
    where,
    select: { tags: true },
  });

  const tagSet = new Set<string>();
  for (const b of blogs) {
    for (const tag of b.tags) {
      if (tag && tag.trim()) {
        tagSet.add(tag.trim());
      }
    }
  }

  return Array.from(tagSet).sort();
}
