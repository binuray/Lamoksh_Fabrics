import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import * as tokenService from '../services/token.service';
import * as otpService from '../services/otp.service';
import { sendSuccess } from '../utils/response';

function extractIpAndAgent(req: Request) {
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || undefined;
  const userAgent = req.headers['user-agent'] || undefined;
  return { ip, userAgent };
}

function setRefreshTokenCookie(res: Response, refreshToken: string) {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

export async function superAdminSignupHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ip, userAgent } = extractIpAndAgent(req);
    const user = await authService.superAdminSignup(req.body, ip, userAgent);
    sendSuccess(res, 201, 'Super Admin registered successfully', { user });
  } catch (error) {
    next(error);
  }
}

export async function superAdminLoginHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ip, userAgent } = extractIpAndAgent(req);
    const result = await authService.login(
      req.body.identifier,
      req.body.password,
      'SUPER_ADMIN',
      ip,
      userAgent
    );
    setRefreshTokenCookie(res, result.refreshToken);
    sendSuccess(res, 200, 'Login successful', result);
  } catch (error) {
    next(error);
  }
}

export async function userSignupHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ip, userAgent } = extractIpAndAgent(req);
    const result = await authService.userSignup(req.body, ip, userAgent);
    setRefreshTokenCookie(res, result.refreshToken);
    sendSuccess(res, 201, 'User registered successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function userLoginHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ip, userAgent } = extractIpAndAgent(req);
    const result = await authService.login(
      req.body.identifier,
      req.body.password,
      undefined,
      ip,
      userAgent
    );
    setRefreshTokenCookie(res, result.refreshToken);
    sendSuccess(res, 200, 'Login successful', result);
  } catch (error) {
    next(error);
  }
}

export async function refreshTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    if (!refreshToken) {
      res.status(400).json({ success: false, message: 'Refresh token is required' });
      return;
    }
    const { ip, userAgent } = extractIpAndAgent(req);
    const tokens = await tokenService.rotateRefreshToken(refreshToken, ip, userAgent);
    setRefreshTokenCookie(res, tokens.refreshToken);
    sendSuccess(res, 200, 'Tokens refreshed successfully', tokens);
  } catch (error) {
    next(error);
  }
}

export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    if (refreshToken) {
      await tokenService.revokeRefreshToken(refreshToken);
    }
    res.clearCookie('refreshToken');
    sendSuccess(res, 200, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
}

export async function changePasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ip, userAgent } = extractIpAndAgent(req);
    const newTokens = await authService.changePassword(
      req.user!.id,
      req.body.oldPassword,
      req.body.newPassword,
      ip,
      userAgent
    );
    setRefreshTokenCookie(res, newTokens.refreshToken);
    sendSuccess(res, 200, 'Password changed successfully', newTokens);
  } catch (error) {
    next(error);
  }
}

export async function forgotPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ip, userAgent } = extractIpAndAgent(req);
    const response = await otpService.requestPasswordReset(req.body.identifier, ip, userAgent);
    sendSuccess(res, 200, response.message);
  } catch (error) {
    next(error);
  }
}

export async function resetPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ip, userAgent } = extractIpAndAgent(req);
    await otpService.resetPassword(
      req.body.identifier,
      req.body.otp,
      req.body.newPassword,
      ip,
      userAgent
    );
    sendSuccess(res, 200, 'Password reset successful. You can now login with your new password.');
  } catch (error) {
    next(error);
  }
}

export async function getMeHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await authService.getMe(req.user!.id);
    sendSuccess(res, 200, 'User profile fetched successfully', { user });
  } catch (error) {
    next(error);
  }
}
