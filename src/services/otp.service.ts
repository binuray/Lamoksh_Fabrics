import { prisma } from '../config/database';
import { generate6DigitOtp, hashOtp, verifyOtp } from '../utils/otp';
import { hashPassword } from '../utils/password';
import { sendOtpResetEmail, sendPasswordChangedEmail } from './mail.service';
import { revokeAllUserTokens } from './token.service';
import { logAuditEvent } from './audit.service';
import { AppError } from '../middleware/error.middleware';
import { env } from '../config/env';

function isEmail(identifier: string): boolean {
  return identifier.includes('@');
}

export async function requestPasswordReset(
  identifier: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; message: string }> {
  const genericResponse = {
    success: true,
    message: 'If an account exists, an OTP has been sent.',
  };

  const formattedIdentifier = isEmail(identifier) ? identifier.toLowerCase().trim() : identifier.trim();

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: formattedIdentifier }, { mobile: formattedIdentifier }],
      deletedAt: null,
    },
  });

  if (!user || !user.isActive) {
    return genericResponse;
  }

  // Invalidate any existing unused OTPs for this user
  await prisma.passwordResetOtp.updateMany({
    where: {
      userId: user.id,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  });

  // Generate new 6-digit OTP
  const rawOtp = generate6DigitOtp();
  const hashedOtp = await hashOtp(rawOtp);
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRES_IN_MINUTES * 60 * 1000);

  await prisma.passwordResetOtp.create({
    data: {
      userId: user.id,
      otpHash: hashedOtp,
      expiresAt,
      maxAttempts: 5,
    },
  });

  // Dispatch email notification
  await sendOtpResetEmail(user.email, rawOtp, env.OTP_EXPIRES_IN_MINUTES);

  await logAuditEvent({
    userId: user.id,
    action: 'FORGOT_PASSWORD_REQUESTED',
    entityType: 'USER',
    entityId: user.id,
    ipAddress,
    userAgent,
  });

  return genericResponse;
}

export async function resetPassword(
  identifier: string,
  rawOtp: string,
  newPassword: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const formattedIdentifier = isEmail(identifier) ? identifier.toLowerCase().trim() : identifier.trim();

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: formattedIdentifier }, { mobile: formattedIdentifier }],
      deletedAt: null,
    },
  });

  if (!user || !user.isActive) {
    throw new AppError('Invalid identifier or OTP', 400);
  }

  const latestOtpRecord = await prisma.passwordResetOtp.findFirst({
    where: {
      userId: user.id,
      usedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!latestOtpRecord) {
    throw new AppError('Invalid or expired OTP', 400);
  }

  if (latestOtpRecord.expiresAt < new Date()) {
    throw new AppError('OTP has expired. Please request a new one.', 400);
  }

  if (latestOtpRecord.attempts >= latestOtpRecord.maxAttempts) {
    throw new AppError('Maximum OTP verification attempts exceeded. Please request a new OTP.', 400);
  }

  const isOtpValid = await verifyOtp(latestOtpRecord.otpHash, rawOtp);

  if (!isOtpValid) {
    await prisma.passwordResetOtp.update({
      where: { id: latestOtpRecord.id },
      data: { attempts: latestOtpRecord.attempts + 1 },
    });
    throw new AppError('Invalid OTP', 400);
  }

  const newPasswordHash = await hashPassword(newPassword);

  // Execute password update and session revocation in a database transaction
  await prisma.$transaction(async (tx: any) => {
    // Mark OTP as used
    await tx.passwordResetOtp.update({
      where: { id: latestOtpRecord.id },
      data: { usedAt: new Date() },
    });

    // Update user password and unlock account if previously locked
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Revoke all existing sessions/refresh tokens
    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await sendPasswordChangedEmail(user.email, user.name);

  await logAuditEvent({
    userId: user.id,
    action: 'PASSWORD_RESET_SUCCESSFUL',
    entityType: 'USER',
    entityId: user.id,
    ipAddress,
    userAgent,
  });
}
