import { prisma } from '../config/database';
import { generateTemporaryPassword, hashPassword } from '../utils/password';
import { sendAdminInvitationEmail } from './mail.service';
import { revokeAllUserTokens } from './token.service';
import { logAuditEvent } from './audit.service';
import { AppError } from '../middleware/error.middleware';

export interface AdminDto {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
}

export async function createAdmin(
  data: { name: string; email: string; mobile: string; role: 'ADMIN' },
  createdByUserId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<AdminDto> {
  if (data.role !== 'ADMIN') {
    throw new AppError('Only ADMIN accounts can be created through this endpoint', 400);
  }

  const emailNormalized = data.email.toLowerCase().trim();
  const mobileNormalized = data.mobile.trim();

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: emailNormalized }, { mobile: mobileNormalized }],
    },
  });

  if (existingUser) {
    throw new AppError('Email or mobile number is already registered', 409);
  }

  const adminRole = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
  });

  if (!adminRole) {
    throw new AppError('ADMIN role is not configured in database', 500);
  }

  const tempPassword = generateTemporaryPassword(12);
  const hashedPassword = await hashPassword(tempPassword);

  const newAdmin = await prisma.user.create({
    data: {
      name: data.name.trim(),
      email: emailNormalized,
      mobile: mobileNormalized,
      passwordHash: hashedPassword,
      roleId: adminRole.id,
      mustChangePassword: true,
      isVerified: true,
      isActive: true,
    },
    include: { role: true },
  });

  // Send temporary password email asynchronously
  await sendAdminInvitationEmail(newAdmin.email, newAdmin.name, tempPassword);

  await logAuditEvent({
    userId: createdByUserId,
    action: 'ADMIN_CREATED',
    entityType: 'USER',
    entityId: newAdmin.id,
    ipAddress,
    userAgent,
    metadata: { createdAdminId: newAdmin.id, email: newAdmin.email },
  });

  return {
    id: newAdmin.id,
    name: newAdmin.name,
    email: newAdmin.email,
    mobile: newAdmin.mobile,
    role: newAdmin.role.name,
    isActive: newAdmin.isActive,
    mustChangePassword: newAdmin.mustChangePassword,
    createdAt: newAdmin.createdAt,
  };
}

export async function getAdmins(page = 1, limit = 10): Promise<{ admins: AdminDto[]; total: number }> {
  const skip = (page - 1) * limit;

  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  if (!adminRole) {
    return { admins: [], total: 0 };
  }

  const whereCondition = {
    roleId: adminRole.id,
    deletedAt: null,
  };

  const [admins, total] = await Promise.all([
    prisma.user.findMany({
      where: whereCondition,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { role: true },
    }),
    prisma.user.count({ where: whereCondition }),
  ]);

  return {
    admins: admins.map((a: any) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      mobile: a.mobile,
      role: a.role.name,
      isActive: a.isActive,
      mustChangePassword: a.mustChangePassword,
      createdAt: a.createdAt,
    })),
    total,
  };
}

export async function getAdminById(id: string): Promise<AdminDto & { permissions: string[] }> {
  const admin = await prisma.user.findUnique({
    where: { id },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  if (!admin || admin.deletedAt !== null) {
    throw new AppError('Admin user not found', 404);
  }

  const permissions = admin.role.rolePermissions.map((rp: any) => rp.permission.name);

  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    mobile: admin.mobile,
    role: admin.role.name,
    isActive: admin.isActive,
    mustChangePassword: admin.mustChangePassword,
    createdAt: admin.createdAt,
    permissions,
  };
}

export async function updateAdmin(
  id: string,
  data: { name?: string; email?: string; mobile?: string; isActive?: boolean },
  updatedByUserId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<AdminDto> {
  const admin = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });

  if (!admin || admin.deletedAt !== null) {
    throw new AppError('Admin user not found', 404);
  }

  if (admin.role.name === 'SUPER_ADMIN') {
    throw new AppError('SUPER_ADMIN account cannot be modified through admin endpoints', 403);
  }

  const updatedAdmin = await prisma.user.update({
    where: { id },
    data: {
      name: data.name ? data.name.trim() : undefined,
      email: data.email ? data.email.toLowerCase().trim() : undefined,
      mobile: data.mobile ? data.mobile.trim() : undefined,
      isActive: data.isActive !== undefined ? data.isActive : undefined,
    },
    include: { role: true },
  });

  if (data.isActive === false) {
    await revokeAllUserTokens(id);
  }

  await logAuditEvent({
    userId: updatedByUserId,
    action: data.isActive === false ? 'ADMIN_DEACTIVATED' : 'ADMIN_UPDATED',
    entityType: 'USER',
    entityId: id,
    ipAddress,
    userAgent,
    metadata: data,
  });

  return {
    id: updatedAdmin.id,
    name: updatedAdmin.name,
    email: updatedAdmin.email,
    mobile: updatedAdmin.mobile,
    role: updatedAdmin.role.name,
    isActive: updatedAdmin.isActive,
    mustChangePassword: updatedAdmin.mustChangePassword,
    createdAt: updatedAdmin.createdAt,
  };
}

export async function deleteAdmin(
  id: string,
  deletedByUserId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const admin = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });

  if (!admin || admin.deletedAt !== null) {
    throw new AppError('Admin user not found', 404);
  }

  if (admin.role.name === 'SUPER_ADMIN') {
    throw new AppError('SUPER_ADMIN account cannot be deleted', 403);
  }

  await prisma.user.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  });

  await revokeAllUserTokens(id);

  await logAuditEvent({
    userId: deletedByUserId,
    action: 'ADMIN_DELETED',
    entityType: 'USER',
    entityId: id,
    ipAddress,
    userAgent,
  });
}

export async function getAdminPermissions(adminId: string): Promise<string[]> {
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  if (!admin || admin.deletedAt !== null) {
    throw new AppError('Admin user not found', 404);
  }

  return admin.role.rolePermissions.map((rp: any) => rp.permission.name);
}

export async function updateAdminPermissions(
  adminId: string,
  permissionNames: string[],
  updatedByUserId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string[]> {
  if (adminId === updatedByUserId) {
    throw new AppError('Admins are not allowed to modify their own permissions', 403);
  }

  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    include: { role: true },
  });

  if (!admin || admin.deletedAt !== null) {
    throw new AppError('Admin user not found', 404);
  }

  if (admin.role.name === 'SUPER_ADMIN') {
    throw new AppError('SUPER_ADMIN permissions cannot be altered', 403);
  }

  // Find all requested permissions
  const validPermissions = await prisma.permission.findMany({
    where: { name: { in: permissionNames } },
  });

  if (validPermissions.length !== permissionNames.length) {
    throw new AppError('One or more permission names are invalid', 400);
  }

  // Update permissions in transaction
  await prisma.$transaction(async (tx: any) => {
    // Clear old permissions for this role
    await tx.rolePermission.deleteMany({
      where: { roleId: admin.roleId },
    });

    // Insert new permissions
    for (const perm of validPermissions) {
      await tx.rolePermission.create({
        data: {
          roleId: admin.roleId,
          permissionId: perm.id,
        },
      });
    }
  });

  await logAuditEvent({
    userId: updatedByUserId,
    action: 'ADMIN_PERMISSIONS_UPDATED',
    entityType: 'ROLE',
    entityId: admin.roleId,
    ipAddress,
    userAgent,
    metadata: { adminId, permissions: permissionNames },
  });

  return permissionNames;
}
