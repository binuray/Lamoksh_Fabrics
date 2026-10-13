import crypto from 'crypto';
import { prisma } from '../config/database';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';
import { AppError } from '../middleware/error.middleware';
import { logAuditEvent } from './audit.service';
import { logger } from '../utils/logger';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function issueTokens(
  userId: string,
  role: string,
  ipAddress?: string,
  userAgent?: string
): Promise<TokenPair> {
  const tokenId = crypto.randomUUID();
  const rawRefreshToken = generateRefreshToken(userId, tokenId);
  const accessToken = generateAccessToken(userId, role);

  const hashedToken = await hashPassword(rawRefreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.refreshToken.create({
    data: {
      id: tokenId,
      userId,
      tokenHash: hashedToken,
      expiresAt,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    },
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
  };
}

export async function rotateRefreshToken(
  rawRefreshToken: string,
  ipAddress?: string,
  userAgent?: string
): Promise<TokenPair> {
  let decoded;
  try {
    decoded = verifyRefreshToken(rawRefreshToken);
  } catch (err) {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const { sub: userId, tokenId } = decoded;

  if (!tokenId) {
    throw new AppError('Invalid refresh token payload', 401);
  }

  const existingToken = await prisma.refreshToken.findUnique({
    where: { id: tokenId },
    include: { user: { include: { role: true } } },
  });

  if (!existingToken) {
    throw new AppError('Refresh token not found or invalidated', 401);
  }

  // Suspicious token reuse detection
  if (existingToken.revokedAt !== null) {
    logger.warn(
      { userId, tokenId, ipAddress },
      'SECURITY ALERT: Revoked refresh token reuse detected! Invalidating all active sessions.'
    );
    await revokeAllUserTokens(userId);
    await logAuditEvent({
      userId,
      action: 'SUSPICIOUS_TOKEN_REUSE',
      entityType: 'REFRESH_TOKEN',
      entityId: tokenId,
      ipAddress,
      userAgent,
      metadata: { warning: 'Revoked refresh token reuse attempted. All sessions revoked.' },
    });
    throw new AppError('Security violation detected. Please log in again.', 401);
  }

  if (existingToken.expiresAt < new Date()) {
    throw new AppError('Refresh token expired. Please log in again.', 401);
  }

  const isHashValid = await verifyPassword(existingToken.tokenHash, rawRefreshToken);
  if (!isHashValid) {
    throw new AppError('Invalid refresh token', 401);
  }

  if (!existingToken.user.isActive || existingToken.user.deletedAt !== null) {
    throw new AppError('Account is inactive or deleted', 403);
  }

  // Revoke old token
  await prisma.refreshToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });

  // Issue new token pair
  const newTokens = await issueTokens(
    userId,
    existingToken.user.role.name,
    ipAddress,
    userAgent
  );

  await logAuditEvent({
    userId,
    action: 'REFRESH_TOKEN_ROTATED',
    entityType: 'REFRESH_TOKEN',
    entityId: tokenId,
    ipAddress,
    userAgent,
  });

  return newTokens;
}

export async function revokeRefreshToken(rawRefreshToken: string): Promise<void> {
  try {
    const decoded = verifyRefreshToken(rawRefreshToken);
    if (decoded.tokenId) {
      await prisma.refreshToken.update({
        where: { id: decoded.tokenId },
        data: { revokedAt: new Date() },
      });
    }
  } catch (error) {
    // Silent catch if token already expired or invalid
  }
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}
