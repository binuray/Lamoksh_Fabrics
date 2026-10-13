import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenPayload {
  sub: string;
  role?: string;
  tokenId?: string;
  type: 'access' | 'refresh';
}

export function generateAccessToken(userId: string, role: string): string {
  const payload: TokenPayload = {
    sub: userId,
    role,
    type: 'access',
  };

  const options: SignOptions = {
    expiresIn: env.ACCESS_TOKEN_EXPIRES_IN as any,
  };

  return jwt.sign(payload, env.JWT_ACCESS_SECRET as Secret, options);
}

export function generateRefreshToken(userId: string, tokenId: string): string {
  const payload: TokenPayload = {
    sub: userId,
    tokenId,
    type: 'refresh',
  };

  const options: SignOptions = {
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN as any,
  };

  return jwt.sign(payload, env.JWT_REFRESH_SECRET as Secret, options);
}

export function verifyAccessToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET as Secret) as TokenPayload;
  if (decoded.type !== 'access') {
    throw new Error('Invalid token type');
  }
  return decoded;
}

export function verifyRefreshToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET as Secret) as TokenPayload;
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  return decoded;
}
