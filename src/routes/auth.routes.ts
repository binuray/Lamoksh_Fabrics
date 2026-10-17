import { Router } from 'express';
import {
  superAdminSignupHandler,
  superAdminLoginHandler,
  userSignupHandler,
  userLoginHandler,
  refreshTokenHandler,
  logoutHandler,
  changePasswordHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  getMeHandler,
} from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validation.middleware';
import { authenticate } from '../middleware/auth.middleware';
import {
  superAdminSignupSchema,
  userSignupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  refreshTokenSchema,
} from '../validators/auth.validator';

const router = Router();

// Super Admin initial signup and login
router.post(
  '/super-admin/signup',
  validateRequest(superAdminSignupSchema),
  superAdminSignupHandler
);

router.post(
  '/super-admin/login',
  validateRequest(loginSchema),
  superAdminLoginHandler
);

// User signup and login
router.post(
  '/signup',
  validateRequest(userSignupSchema),
  userSignupHandler
);

router.post(
  '/login',
  validateRequest(loginSchema),
  userLoginHandler
);

// Refresh Token & Logout
router.post('/refresh-token', validateRequest(refreshTokenSchema), refreshTokenHandler);
router.post('/logout', logoutHandler);

// Password Management
router.post(
  '/change-password',
  authenticate,
  validateRequest(changePasswordSchema),
  changePasswordHandler
);

router.post(
  '/forgot-password',
  validateRequest(forgotPasswordSchema),
  forgotPasswordHandler
);

router.post(
  '/reset-password',
  validateRequest(resetPasswordSchema),
  resetPasswordHandler
);

// Profile
router.get('/me', authenticate, getMeHandler);

export default router;
