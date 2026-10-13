import { prisma } from '../config/database';
import { hashPassword, verifyPassword } from '../utils/password';
import { issueTokens, revokeAllUserTokens, TokenPair } from './token.service';
import { logAuditEvent } from './audit.service';
import { AppError } from '../middleware/error.middleware';
import { env } from '../config/env';

function isEmail(identifier: string): boolean {
  return identifier.includes('@');
}

export interface UserResponseDto {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: string;
  mustChangePassword?: boolean;
}

export interface LoginResult {
  user: UserResponseDto;
  accessToken: string;
  refreshToken: string;
}

export async function superAdminSignup(
  data: { name: string; email: string; mobile: string; password: string },
  ipAddress?: string,
  userAgent?: string
): Promise<UserResponseDto> {
  const emailNormalized = data.email.toLowerCase().trim();
  const mobileNormalized = data.mobile.trim();

  // Execute in transaction to ensure atomic single super admin check
  return await prisma.$transaction(async (tx: any) => {
    let superAdminRole = await tx.role.findUnique({
      where: { name: 'SUPER_ADMIN' },
    });

    if (!superAdminRole) {
      superAdminRole = await tx.role.create({
        data: {
          name: 'SUPER_ADMIN',
          description: 'Highest authority in the system with full permissions',
        },
      });
    }

    // Check if any Super Admin already exists
    const existingSuperAdmin = await tx.user.findFirst({
      where: {
        roleId: superAdminRole.id,
        deletedAt: null,
      },
    });

    if (existingSuperAdmin) {
      throw new AppError('Super Admin already exists', 409);
    }

    // Check email / mobile uniqueness
    const existingUser = await tx.user.findFirst({
      where: {
        OR: [{ email: emailNormalized }, { mobile: mobileNormalized }],
      },
    });

    if (existingUser) {
      throw new AppError('Email or mobile number is already in use', 409);
    }

    const hashedPassword = await hashPassword(data.password);

    const user = await tx.user.create({
      data: {
        name: data.name.trim(),
        email: emailNormalized,
        mobile: mobileNormalized,
        passwordHash: hashedPassword,
        roleId: superAdminRole.id,
        isVerified: true,
      },
      include: { role: true },
    });

    await logAuditEvent({
      userId: user.id,
      action: 'SUPER_ADMIN_SIGNUP',
      entityType: 'USER',
      entityId: user.id,
      ipAddress,
      userAgent,
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role.name,
    };
  });
}

export async function login(
  identifier: string,
  plainPassword: string,
  requiredRole?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<LoginResult> {
  const formattedIdentifier = isEmail(identifier) ? identifier.toLowerCase().trim() : identifier.trim();

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: formattedIdentifier }, { mobile: formattedIdentifier }],
      deletedAt: null,
    },
    include: { role: true },
  });

  // Generic message to prevent account enumeration
  const invalidCredentialsError = new AppError('Invalid email/mobile or password', 401);

  if (!user) {
    throw invalidCredentialsError;
  }

  if (requiredRole && user.role.name !== requiredRole) {
    throw invalidCredentialsError;
  }

  if (!user.isActive) {
    throw new AppError('Account is deactivated. Please contact support.', 403);
  }

  // Check account lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const lockMinutesRemaining = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / (60 * 1000)
    );
    throw new AppError(
      `Account temporarily locked due to multiple failed login attempts. Try again in ${lockMinutesRemaining} minutes.`,
      423
    );
  }

  const isPasswordValid = await verifyPassword(user.passwordHash, plainPassword);

  if (!isPasswordValid) {
    const attempts = user.failedLoginAttempts + 1;
    let lockedUntil: Date | null = null;

    if (attempts >= env.MAX_LOGIN_ATTEMPTS) {
      lockedUntil = new Date(Date.now() + env.ACCOUNT_LOCK_MINUTES * 60 * 1000);
      await logAuditEvent({
        userId: user.id,
        action: 'ACCOUNT_LOCKED',
        entityType: 'USER',
        entityId: user.id,
        ipAddress,
        userAgent,
        metadata: { attempts, lockedUntil },
      });
    } else {
      await logAuditEvent({
        userId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'USER',
        entityId: user.id,
        ipAddress,
        userAgent,
        metadata: { attempts },
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil,
      },
    });

    if (lockedUntil) {
      throw new AppError('Account temporarily locked. Try again later.', 423);
    }

    throw invalidCredentialsError;
  }

  // Reset login attempt counters on successful login
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });

  const tokens = await issueTokens(user.id, user.role.name, ipAddress, userAgent);

  await logAuditEvent({
    userId: user.id,
    action: 'LOGIN_SUCCESSFUL',
    entityType: 'USER',
    entityId: user.id,
    ipAddress,
    userAgent,
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role.name,
      mustChangePassword: user.mustChangePassword,
    },
    ...tokens,
  };
}

export async function userSignup(
  data: { name: string; email: string; mobile: string; password: string },
  ipAddress?: string,
  userAgent?: string
): Promise<LoginResult> {
  const emailNormalized = data.email.toLowerCase().trim();
  const mobileNormalized = data.mobile.trim();

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: emailNormalized }, { mobile: mobileNormalized }],
    },
  });

  if (existingUser) {
    if (existingUser.email === emailNormalized) {
      throw new AppError('Email address is already registered', 409);
    }
    throw new AppError('Mobile number is already registered', 409);
  }

  let userRole = await prisma.role.findUnique({
    where: { name: 'USER' },
  });

  if (!userRole) {
    userRole = await prisma.role.create({
      data: {
        name: 'USER',
        description: 'Standard customer user',
      },
    });
  }

  const hashedPassword = await hashPassword(data.password);

  const newUser = await prisma.user.create({
    data: {
      name: data.name.trim(),
      email: emailNormalized,
      mobile: mobileNormalized,
      passwordHash: hashedPassword,
      roleId: userRole.id,
      isVerified: true,
    },
    include: { role: true },
  });

  const tokens = await issueTokens(newUser.id, newUser.role.name, ipAddress, userAgent);

  await logAuditEvent({
    userId: newUser.id,
    action: 'USER_SIGNUP',
    entityType: 'USER',
    entityId: newUser.id,
    ipAddress,
    userAgent,
  });

  return {
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      mobile: newUser.mobile,
      role: newUser.role.name,
    },
    ...tokens,
  };
}

export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
  ipAddress?: string,
  userAgent?: string
): Promise<TokenPair> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });

  if (!user || user.deletedAt !== null) {
    throw new AppError('User not found', 404);
  }

  const isOldPasswordValid = await verifyPassword(user.passwordHash, oldPassword);

  if (!isOldPasswordValid) {
    throw new AppError('Incorrect old password', 400);
  }

  const isSamePassword = await verifyPassword(user.passwordHash, newPassword);

  if (isSamePassword) {
    throw new AppError('New password cannot be the same as old password', 400);
  }

  const newHashedPassword = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: newHashedPassword,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  });

  // Revoke all previous refresh tokens
  await revokeAllUserTokens(userId);

  // Issue new session tokens
  const newTokens = await issueTokens(user.id, user.role.name, ipAddress, userAgent);

  await logAuditEvent({
    userId: user.id,
    action: 'PASSWORD_CHANGED',
    entityType: 'USER',
    entityId: user.id,
    ipAddress,
    userAgent,
  });

  return newTokens;
}

export async function getMe(userId: string): Promise<UserResponseDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });

  if (!user || user.deletedAt !== null) {
    throw new AppError('User not found', 404);
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role.name,
    mustChangePassword: user.mustChangePassword,
  };
}
