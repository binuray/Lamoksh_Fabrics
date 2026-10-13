import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middleware/error.middleware';
import { getProfile, updateProfile } from '../services/profile.service';

export async function getProfileHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }
    const profile = await getProfile(req.user.id);
    sendSuccess(res, 200, 'Profile retrieved successfully', profile);
  } catch (error) {
    next(error);
  }
}

export async function updateProfileHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }
    const updatedProfile = await updateProfile(req.user.id, req.body);
    sendSuccess(res, 200, 'Profile updated successfully', updatedProfile);
  } catch (error) {
    next(error);
  }
}
