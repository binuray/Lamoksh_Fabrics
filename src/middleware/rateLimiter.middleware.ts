import { Request, Response, NextFunction } from 'express';

const noopMiddleware = (_req: Request, _res: Response, next: NextFunction) => next();

export const apiLimiter = noopMiddleware;
export const loginLimiter = noopMiddleware;
export const forgotPasswordLimiter = noopMiddleware;
export const otpLimiter = noopMiddleware;

