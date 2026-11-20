// Loaded automatically by vitest before test files (see vitest config below).
import { beforeAll } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'x'.repeat(32);
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'y'.repeat(32);
process.env.CREDENTIALS_ENC_KEY_BASE64 = process.env.CREDENTIALS_ENC_KEY_BASE64 || Buffer.alloc(32, 1).toString('base64');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/test';
process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
process.env.METAAPI_TOKEN = process.env.METAAPI_TOKEN || 'test';
process.env.SMTP_HOST = process.env.SMTP_HOST || 'localhost';
process.env.SMTP_PORT = process.env.SMTP_PORT || '1025';
process.env.SMTP_USER = process.env.SMTP_USER || 'test';
process.env.SMTP_PASS = process.env.SMTP_PASS || 'test';
process.env.EMAIL_FROM = process.env.EMAIL_FROM || 'test@test.com';
process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'test';
process.env.PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || 'test';
process.env.AI_ENABLED = 'false';

beforeAll(() => {});