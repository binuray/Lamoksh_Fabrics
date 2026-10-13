import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { AppError } from './error.middleware';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB

const storage = multer.memoryStorage();

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.fieldname === 'images') {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      return cb(new AppError('Invalid image file format. Allowed: JPEG, JPG, PNG, WEBP', 400));
    }
  } else if (file.fieldname === 'videos') {
    if (!ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
      return cb(new AppError('Invalid video file format. Allowed: MP4, WEBM, MOV', 400));
    }
  } else {
    return cb(new AppError(`Unexpected field '${file.fieldname}' in upload request`, 400));
  }

  cb(null, true);
};

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_VIDEO_SIZE_BYTES, // Set upper limit to video max size; per-file checks handled below
  },
  fileFilter,
});

export const uploadProductMediaFields = upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'videos', maxCount: 2 },
]);

export function validateProductMediaFiles(req: Request, res: Response, next: NextFunction): void {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  const images = files?.images || [];
  const videos = files?.videos || [];

  // Check individual image size limits (50 MB)
  for (const img of images) {
    if (img.size > MAX_IMAGE_SIZE_BYTES) {
      return next(new AppError('Image size must not exceed 50 MB', 413));
    }
  }

  // Check individual video size limits (200 MB)
  for (const vid of videos) {
    if (vid.size > MAX_VIDEO_SIZE_BYTES) {
      return next(new AppError('Video size must not exceed 200 MB', 413));
    }
  }

  next();
}

const blogFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedFields = ['featuredImage', 'images', 'image'];
  if (!allowedFields.includes(file.fieldname)) {
    return cb(new AppError(`Unexpected field '${file.fieldname}' in upload request`, 400));
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype) && file.mimetype !== 'image/gif') {
    return cb(new AppError('Invalid image file format. Allowed: JPEG, JPG, PNG, WEBP, GIF', 400));
  }
  cb(null, true);
};

export const blogUpload = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
  },
  fileFilter: blogFileFilter,
});

export const uploadBlogMediaFields = blogUpload.fields([
  { name: 'featuredImage', maxCount: 1 },
  { name: 'images', maxCount: 10 },
]);

export const uploadSingleBlogImage = blogUpload.single('image');

export function validateBlogMediaFiles(req: Request, res: Response, next: NextFunction): void {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const singleFile = req.file;

  const featured = files?.featuredImage || [];
  const images = files?.images || [];
  const allImages = [...featured, ...images];
  if (singleFile) allImages.push(singleFile);

  for (const img of allImages) {
    if (img.size > MAX_IMAGE_SIZE_BYTES) {
      return next(new AppError('Image size must not exceed 50 MB', 413));
    }
  }

  next();
}

