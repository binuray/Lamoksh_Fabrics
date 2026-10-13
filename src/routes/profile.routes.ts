import { Router } from 'express';
import { getProfileHandler, updateProfileHandler } from '../controllers/profile.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { updateProfileSchema } from '../validators/profile.validator';

const router = Router();

router.use(authenticate);

router.get('/', getProfileHandler);
router.patch('/', validateRequest(updateProfileSchema), updateProfileHandler);

export default router;
