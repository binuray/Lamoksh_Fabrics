import { Request, Response, NextFunction } from 'express';
import * as blogService from '../services/blog.service';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middleware/error.middleware';
import { BlogStatus } from '@prisma/client';

export async function createBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const featuredImage = files?.featuredImage;
    const images = files?.images;

    const blog = await blogService.createBlog(
      req.body,
      { featuredImage, images },
      req.user
    );

    sendSuccess(res, 201, 'Blog created successfully', { blog });
  } catch (error) {
    next(error);
  }
}

export async function getAdminBlogsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const tag = req.query.tag as string | undefined;
    const status = req.query.status as BlogStatus | undefined;
    const sortBy = req.query.sortBy as 'createdAt' | 'updatedAt' | 'publishedAt' | 'title' | undefined;
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' | undefined;

    const result = await blogService.getAdminBlogs({
      page,
      limit,
      search,
      category,
      tag,
      status,
      sortBy,
      sortOrder,
    });

    sendSuccess(res, 200, 'Blogs retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function getBlogByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const blog = await blogService.getBlogById(id);
    sendSuccess(res, 200, 'Blog details retrieved successfully', { blog });
  } catch (error) {
    next(error);
  }
}

export async function updateBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const featuredImage = files?.featuredImage;
    const images = files?.images;

    const blog = await blogService.updateBlog(id, req.body, { featuredImage, images });
    sendSuccess(res, 200, 'Blog updated successfully', { blog });
  } catch (error) {
    next(error);
  }
}

export async function publishBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const blog = await blogService.publishBlog(id);
    sendSuccess(res, 200, 'Blog published successfully', { blog });
  } catch (error) {
    next(error);
  }
}

export async function unpublishBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const blog = await blogService.unpublishBlog(id);
    sendSuccess(res, 200, 'Blog unpublished successfully', { blog });
  } catch (error) {
    next(error);
  }
}

export async function deleteBlogHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await blogService.deleteBlog(id);
    sendSuccess(res, 200, 'Blog deleted successfully');
  } catch (error) {
    next(error);
  }
}

export async function uploadBlogImageHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file) {
      throw new AppError('Image file is required', 400);
    }

    const altText = req.body.altText;
    const blogId = req.body.blogId;

    const image = await blogService.uploadBlogImage(req.file, altText, blogId);
    sendSuccess(res, 201, 'Image uploaded successfully', { image });
  } catch (error) {
    next(error);
  }
}

export async function updateBlogImageHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const blogId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const imageId = Array.isArray(req.params.imageId) ? req.params.imageId[0] : req.params.imageId;
    const { altText, isFeatured } = req.body;

    const image = await blogService.updateBlogImage(blogId, imageId, altText, isFeatured);
    sendSuccess(res, 200, 'Image updated successfully', { image });
  } catch (error) {
    next(error);
  }
}

export async function deleteBlogImageHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const blogId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const imageId = Array.isArray(req.params.imageId) ? req.params.imageId[0] : req.params.imageId;

    await blogService.deleteBlogImage(blogId, imageId);
    sendSuccess(res, 200, 'Image deleted successfully');
  } catch (error) {
    next(error);
  }
}

export async function getAdminCategoriesHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const categories = await blogService.getBlogCategories(false);
    sendSuccess(res, 200, 'Blog categories retrieved successfully', { categories });
  } catch (error) {
    next(error);
  }
}

// Public API Handlers

export async function getPublicBlogsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const tag = req.query.tag as string | undefined;
    const sortBy = req.query.sortBy as 'createdAt' | 'publishedAt' | 'title' | undefined;
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' | undefined;

    const result = await blogService.getPublicBlogs({
      page,
      limit,
      search,
      category,
      tag,
      sortBy,
      sortOrder,
    });

    sendSuccess(res, 200, 'Published blogs retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function getPublicBlogBySlugOrIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawIdentifier = req.params.identifier || req.params.slug || req.params.id;
    const identifier = Array.isArray(rawIdentifier) ? rawIdentifier[0] : rawIdentifier;
    const blog = await blogService.getPublicBlogBySlugOrId(identifier);
    sendSuccess(res, 200, 'Blog details retrieved successfully', { blog });
  } catch (error) {
    next(error);
  }
}

export async function getPublicCategoriesHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const categories = await blogService.getBlogCategories(true);
    sendSuccess(res, 200, 'Blog categories retrieved successfully', { categories });
  } catch (error) {
    next(error);
  }
}

export async function getPublicTagsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tags = await blogService.getBlogTags(true);
    sendSuccess(res, 200, 'Blog tags retrieved successfully', { tags });
  } catch (error) {
    next(error);
  }
}
