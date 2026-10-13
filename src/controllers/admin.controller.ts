import { Request, Response, NextFunction } from 'express';
import * as adminService from '../services/admin.service';
import { sendSuccess } from '../utils/response';

function extractIpAndAgent(req: Request) {
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || undefined;
  const userAgent = req.headers['user-agent'] || undefined;
  return { ip, userAgent };
}

function getParamId(req: Request): string {
  return Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
}

export async function createAdminHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ip, userAgent } = extractIpAndAgent(req);
    const admin = await adminService.createAdmin(req.body, req.user!.id, ip, userAgent);
    sendSuccess(res, 201, 'Admin user created successfully', { admin });
  } catch (error) {
    next(error);
  }
}

export async function getAdminsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const result = await adminService.getAdmins(page, limit);
    sendSuccess(res, 200, 'Admins retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function getAdminByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = await adminService.getAdminById(getParamId(req));
    sendSuccess(res, 200, 'Admin details retrieved successfully', { admin });
  } catch (error) {
    next(error);
  }
}

export async function updateAdminHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ip, userAgent } = extractIpAndAgent(req);
    const admin = await adminService.updateAdmin(getParamId(req), req.body, req.user!.id, ip, userAgent);
    sendSuccess(res, 200, 'Admin updated successfully', { admin });
  } catch (error) {
    next(error);
  }
}

export async function deleteAdminHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ip, userAgent } = extractIpAndAgent(req);
    await adminService.deleteAdmin(getParamId(req), req.user!.id, ip, userAgent);
    sendSuccess(res, 200, 'Admin deleted successfully');
  } catch (error) {
    next(error);
  }
}

export async function getAdminPermissionsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const permissions = await adminService.getAdminPermissions(getParamId(req));
    sendSuccess(res, 200, 'Admin permissions retrieved successfully', { permissions });
  } catch (error) {
    next(error);
  }
}

export async function updateAdminPermissionsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ip, userAgent } = extractIpAndAgent(req);
    const permissions = await adminService.updateAdminPermissions(
      getParamId(req),
      req.body.permissions,
      req.user!.id,
      ip,
      userAgent
    );
    sendSuccess(res, 200, 'Admin permissions updated successfully', { permissions });
  } catch (error) {
    next(error);
  }
}
