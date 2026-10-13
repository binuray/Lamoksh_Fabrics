import { Router } from 'express';
import {
  createCategoryHandler,
  getAdminCategoriesHandler,
  getCategoryByIdHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
  getPublicCategoriesHandler,
  getPublicCategoryByIdHandler,
} from '../controllers/category.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { createCategorySchema, updateCategorySchema } from '../validators/category.validator';

export const adminCategoryRouter = Router();

// Admin Category Routes (Protected)
adminCategoryRouter.use(authenticate);
adminCategoryRouter.use(authorizeRoles('SUPER_ADMIN', 'ADMIN'));

adminCategoryRouter.post('/', validateRequest(createCategorySchema), createCategoryHandler);
adminCategoryRouter.get('/', getAdminCategoriesHandler);
adminCategoryRouter.get('/:id', getCategoryByIdHandler);
adminCategoryRouter.put('/:id', validateRequest(updateCategorySchema), updateCategoryHandler);
adminCategoryRouter.delete('/:id', deleteCategoryHandler);

export const publicCategoryRouter = Router();

// Public Category Routes (No Auth)
publicCategoryRouter.get('/', getPublicCategoriesHandler);
publicCategoryRouter.get('/:id', getPublicCategoryByIdHandler);
