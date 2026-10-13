import { Router } from 'express';
import {
  createAdminHandler,
  getAdminsHandler,
  getAdminByIdHandler,
  updateAdminHandler,
  deleteAdminHandler,
  getAdminPermissionsHandler,
  updateAdminPermissionsHandler,
} from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { requirePermission } from '../middleware/permission.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import {
  createAdminSchema,
  updateAdminSchema,
  updatePermissionsSchema,
} from '../validators/admin.validator';

const router = Router();

// Require authentication for all admin management routes
router.use(authenticate);

// Super Admin creates an Admin
router.post(
  '/',
  authorizeRoles('SUPER_ADMIN'),
  requirePermission('ADMIN_CREATE'),
  validateRequest(createAdminSchema),
  createAdminHandler
);

// Get paginated list of Admins
router.get(
  '/',
  authorizeRoles('SUPER_ADMIN', 'ADMIN'),
  requirePermission('ADMIN_READ'),
  getAdminsHandler
);

// Get single Admin by ID
router.get(
  '/:id',
  authorizeRoles('SUPER_ADMIN', 'ADMIN'),
  requirePermission('ADMIN_READ'),
  getAdminByIdHandler
);

// Update Admin by ID
router.patch(
  '/:id',
  authorizeRoles('SUPER_ADMIN'),
  requirePermission('ADMIN_UPDATE'),
  validateRequest(updateAdminSchema),
  updateAdminHandler
);

// Delete Admin by ID (soft delete)
router.delete(
  '/:id',
  authorizeRoles('SUPER_ADMIN'),
  requirePermission('ADMIN_DELETE'),
  deleteAdminHandler
);

// Get Admin Permissions
router.get(
  '/:id/permissions',
  authorizeRoles('SUPER_ADMIN', 'ADMIN'),
  requirePermission('ADMIN_READ'),
  getAdminPermissionsHandler
);

// Update Admin Permissions
router.put(
  '/:id/permissions',
  authorizeRoles('SUPER_ADMIN'),
  requirePermission('ADMIN_UPDATE'),
  validateRequest(updatePermissionsSchema),
  updateAdminPermissionsHandler
);

export default router;
