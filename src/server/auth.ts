import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from './env';
import { Errors } from './errors';

export interface AccessTokenPayload {
  sub: string;
  typ: 'access';
  roles: string[];
}

export interface RefreshTokenPayload {
  sub: string;
  typ: 'refresh';
  jti: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(userId: string, roles: string[] = []): string {
  const payload: AccessTokenPayload = { sub: userId, typ: 'access', roles };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL_SECONDS });
}

export function signRefreshToken(userId: string, jti: string): string {
  const payload: RefreshTokenPayload = { sub: userId, typ: 'refresh', jti };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL_SECONDS });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    if (decoded.typ !== 'access') throw new Error('wrong token type');
    return decoded;
  } catch {
    throw Errors.unauthorized('Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
    if (decoded.typ !== 'refresh') throw new Error('wrong token type');
    return decoded;
  } catch {
    throw Errors.unauthorized('Invalid or expired refresh token');
  }
}

export function refreshTokenExpiryDate(): Date {
  return new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000);
}