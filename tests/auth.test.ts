import { describe, it, expect, beforeAll } from 'vitest';
import {
  hashPassword, verifyPassword, signAccessToken, verifyAccessToken,
  signRefreshToken, verifyRefreshToken,
} from '../src/server/auth';

process.env.JWT_ACCESS_SECRET = 'x'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'y'.repeat(32);
process.env.JWT_ACCESS_TTL_SECONDS = '900';
process.env.JWT_REFRESH_TTL_SECONDS = '2592000';
process.env.BCRYPT_ROUNDS = '10';
process.env.CREDENTIALS_ENC_KEY_BASE64 = Buffer.alloc(32, 1).toString('base64');
process.env.DATABASE_URL = 'postgres://localhost/test';
process.env.APP_BASE_URL = 'http://localhost:5173';
process.env.METAAPI_TOKEN = 'test';
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '1025';
process.env.SMTP_USER = 'test';
process.env.SMTP_PASS = 'test';
process.env.EMAIL_FROM = 'test@test.com';
process.env.PAYSTACK_SECRET_KEY = 'test';
process.env.PAYSTACK_PUBLIC_KEY = 'test';

describe('auth', () => {
  beforeAll(() => { /* env loaded lazily by module import */ });

  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash).not.toBe('correct-horse-battery');
    expect(await verifyPassword('correct-horse-battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('signs and verifies access tokens', () => {
    const token = signAccessToken('user-1', ['admin']);
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.typ).toBe('access');
    expect(payload.roles).toEqual(['admin']);
  });

  it('signs and verifies refresh tokens', () => {
    const token = signRefreshToken('user-1', 'jti-1');
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.typ).toBe('refresh');
    expect(payload.jti).toBe('jti-1');
  });

  it('rejects tampered access tokens', () => {
    const token = signAccessToken('user-1');
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });

  it('rejects a refresh token used as access token', () => {
    const refresh = signRefreshToken('user-1', 'jti-2');
    expect(() => verifyAccessToken(refresh)).toThrow();
  });
});