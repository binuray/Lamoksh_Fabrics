import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { sendError } from '../utils/response';

export class AppError extends Error {
  public statusCode: number;
  public errors: any[];

  constructor(message: string, statusCode = 400, errors: any[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): Response {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled Exception Occurred');

  if (err instanceof AppError) {
    return sendError(res, err.statusCode, err.message, err.errors);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 413, 'File size limit exceeded');
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return sendError(res, 400, 'Maximum file count exceeded');
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return sendError(res, 400, `Unexpected field '${err.field}' in upload request`);
    }
    return sendError(res, 400, err.message);
  }

  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return sendError(res, 422, 'Validation error', formattedErrors);
  }

  if (err.name === 'PrismaClientKnownRequestError' || err.code) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[]) || [];
      return sendError(res, 409, `Conflict: Unique constraint failed on field(s): ${target.join(', ')}`);
    }
    if (err.code === 'P2025') {
      return sendError(res, 404, 'Requested record not found');
    }
  }

  const message = env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Internal server error';
  const errors = env.NODE_ENV === 'development' && err.stack ? [err.stack] : [];

  return sendError(res, 500, message, errors);
}
