import { Router } from 'express';
import {
  createProductHandler,
  getAdminProductsHandler,
  getProductByIdHandler,
  updateProductHandler,
  deleteProductHandler,
  getPublicProductsHandler,
  getPublicProductByIdHandler,
} from '../controllers/product.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { normalizeBody } from '../middleware/normalization.middleware';
import { uploadProductMediaFields, validateProductMediaFiles } from '../middleware/upload.middleware';
import { createProductSchema, updateProductSchema } from '../validators/product.validator';

export const adminProductRouter = Router();

const normalizeProductBody = normalizeBody({
  numberFields: ['gst', 'basePrice', 'sellPrice', 'stock'],
  jsonFields: ['variants', 'existingMediaIds', 'removeMediaIds'],
});

// Admin Product Routes (Protected)
adminProductRouter.use(authenticate);
adminProductRouter.use(authorizeRoles('SUPER_ADMIN', 'ADMIN'));

adminProductRouter.post(
  '/',
  uploadProductMediaFields,
  validateProductMediaFiles,
  normalizeProductBody,
  validateRequest(createProductSchema),
  createProductHandler
);
adminProductRouter.get('/', getAdminProductsHandler);
adminProductRouter.get('/:id', getProductByIdHandler);
adminProductRouter.put(
  '/:id',
  uploadProductMediaFields,
  validateProductMediaFiles,
  normalizeProductBody,
  validateRequest(updateProductSchema),
  updateProductHandler
);
adminProductRouter.delete('/:id', deleteProductHandler);

export const publicProductRouter = Router();

// Public Product Routes (No Auth)
publicProductRouter.get('/', getPublicProductsHandler);
publicProductRouter.get('/:id', getPublicProductByIdHandler);
