import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError } from './error.middleware';

export function requirePermission(permissionName: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new AppError('User authentication required', 401));
      }

      // SUPER_ADMIN automatically has all permissions
      if (req.user.role === 'SUPER_ADMIN') {
        return next();
      }

      // Check if permission exists in database
      const permission = await prisma.permission.findUnique({
        where: { name: permissionName },
      });

      if (!permission) {
        return next(new AppError(`Permission '${permissionName}' is not defined in system`, 500));
      }

      // Check if user's role has this permission assigned
      const hasPermission = await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: {
            roleId: req.user.roleId,
            permissionId: permission.id,
          },
        },
      });

      if (!hasPermission) {
        return next(
          new AppError(
            `Access denied. You do not have the required permission: ${permissionName}`,
            403
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
