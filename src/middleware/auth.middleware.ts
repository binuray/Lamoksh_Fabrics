import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/database';
import { AppError } from './error.middleware';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  mobile: string;
  role: string;
  roleId: string;
  mustChangePassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      throw new AppError('Authentication token missing or invalid', 401);
    }

    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: { role: true },
    });

    if (!user || user.deletedAt !== null) {
      throw new AppError('User account not found or deleted', 401);
    }

    if (!user.isActive) {
      throw new AppError('User account is deactivated. Please contact support.', 403);
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      mobile: user.mobile,
      role: user.role.name,
      roleId: user.roleId,
      mustChangePassword: user.mustChangePassword,
    };

    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      next(new AppError('Invalid or expired authentication token', 401));
    } else {
      next(error);
    }
  }
}
