import { Router } from 'express';
import {
  createBlogHandler,
  getAdminBlogsHandler,
  getBlogByIdHandler,
  updateBlogHandler,
  publishBlogHandler,
  unpublishBlogHandler,
  deleteBlogHandler,
  uploadBlogImageHandler,
  updateBlogImageHandler,
  deleteBlogImageHandler,
  getAdminCategoriesHandler,
  getPublicBlogsHandler,
  getPublicBlogBySlugOrIdHandler,
  getPublicCategoriesHandler,
  getPublicTagsHandler,
} from '../controllers/blog.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import {
  uploadBlogMediaFields,
  uploadSingleBlogImage,
  validateBlogMediaFiles,
} from '../middleware/upload.middleware';
import {
  createBlogSchema,
  updateBlogSchema,
  uploadContentImageSchema,
  updateImageAltSchema,
} from '../validators/blog.validator';

export const adminBlogRouter = Router();

// Admin Blog Management Routes (Protected)
adminBlogRouter.use(authenticate);
adminBlogRouter.use(authorizeRoles('SUPER_ADMIN', 'ADMIN'));

// Upload image for content insertion in rich text editor
adminBlogRouter.post(
  '/upload-image',
  uploadSingleBlogImage,
  validateBlogMediaFiles,
  validateRequest(uploadContentImageSchema),
  uploadBlogImageHandler
);

// Admin Category Aggregation
adminBlogRouter.get('/categories', getAdminCategoriesHandler);

// Main Admin Blog CRUD
adminBlogRouter.post(
  '/',
  uploadBlogMediaFields,
  validateBlogMediaFiles,
  validateRequest(createBlogSchema),
  createBlogHandler
);

adminBlogRouter.get('/', getAdminBlogsHandler);
adminBlogRouter.get('/:id', getBlogByIdHandler);

adminBlogRouter.put(
  '/:id',
  uploadBlogMediaFields,
  validateBlogMediaFiles,
  validateRequest(updateBlogSchema),
  updateBlogHandler
);

adminBlogRouter.patch('/:id/publish', publishBlogHandler);
adminBlogRouter.patch('/:id/unpublish', unpublishBlogHandler);
adminBlogRouter.delete('/:id', deleteBlogHandler);

// Blog Image Sub-routes
adminBlogRouter.patch(
  '/:id/images/:imageId',
  validateRequest(updateImageAltSchema),
  updateBlogImageHandler
);
adminBlogRouter.delete('/:id/images/:imageId', deleteBlogImageHandler);

// Public Blog Routes (No Auth)
export const publicBlogRouter = Router();

publicBlogRouter.get('/', getPublicBlogsHandler);
publicBlogRouter.get('/categories', getPublicCategoriesHandler);
publicBlogRouter.get('/tags', getPublicTagsHandler);
publicBlogRouter.get('/:identifier', getPublicBlogBySlugOrIdHandler);
