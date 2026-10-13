import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/database';
import { AppError } from './error.middleware';
import { AuthUser } from './auth.middleware';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      guestId?: string;
    }
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

export async function optionalAuth(
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

    if (token) {
      // User passed an authentication token
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

      // Also extract guestId if passed alongside authenticated token (e.g. for merge)
      const guestIdHeader =
        (req.headers['x-guest-id'] as string) ||
        (req.headers['guest-id'] as string) ||
        req.cookies?.guestId ||
        (req.body && typeof req.body.guestId === 'string' ? req.body.guestId : undefined);

      if (guestIdHeader && isValidUuid(guestIdHeader)) {
        req.guestId = guestIdHeader;
      }
    } else {
      // Unauthenticated request -> guest flow
      let guestId =
        (req.headers['x-guest-id'] as string) ||
        (req.headers['guest-id'] as string) ||
        req.cookies?.guestId ||
        (req.body && typeof req.body.guestId === 'string' ? req.body.guestId : undefined);

      if (!guestId || !isValidUuid(guestId)) {
        guestId = crypto.randomUUID();
      }

      req.guestId = guestId;
      res.setHeader('X-Guest-ID', guestId);
      res.cookie('guestId', guestId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
    }

    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      next(new AppError('Invalid or expired authentication token', 401));
    } else {
      next(error);
    }
  }
}
