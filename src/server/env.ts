import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url(),
  DATABASE_SSL: z.string().transform((v) => v === 'true').default('false'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  CREDENTIALS_ENC_KEY_BASE64: z.string().refine((v) => {
    try { return Buffer.from(v, 'base64').length === 32; } catch { return false; }
  }, 'CREDENTIALS_ENC_KEY_BASE64 must decode to exactly 32 bytes'),

  APP_BASE_URL: z.string().url(),

  METAAPI_TOKEN: z.string().min(1),
  METAAPI_BASE_URL: z.string().url().default('https://mt-client-api-v1.new-york.agiliumtrade.ai'),
  METAAPI_PROVISIONING_BASE_URL: z.string().url().default('https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: z.string().transform((v) => v === 'true').default('false'),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  EMAIL_FROM: z.string().email(),

  PAYSTACK_SECRET_KEY: z.string().min(1),
  PAYSTACK_PUBLIC_KEY: z.string().min(1),
  PAYSTACK_BASE_URL: z.string().url().default('https://api.paystack.co'),
  PAYSTACK_CURRENCY: z.string().length(3).default('NGN'),
  FLUTTERWAVE_SECRET_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  FLUTTERWAVE_WEBHOOK_SECRET_HASH: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  FLUTTERWAVE_CURRENCIES: z.string().default('NGN,USD,GBP,EUR,GHS,KES,UGX,TZS,RWF,ZAR'),
  STRIPE_SECRET_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  STRIPE_WEBHOOK_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  STRIPE_BANK_TRANSFER_CURRENCIES: z.string().default('USD,EUR,GBP,JPY,MXN'),
  PAYMENT_FX_API_URL: z.string().url().default('https://open.er-api.com/v6/latest/USD'),

  JOB_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  JOB_BATCH_SIZE: z.coerce.number().int().positive().default(5),
  LOG_LEVEL: z.enum(['fatal','error','warn','info','debug','trace']).default('info'),

  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),

  AI_ENABLED: z.string().transform((v) => v === 'true').default('false'),
  AI_PROVIDER_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  AI_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  AI_MODEL: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
});

export type Env = z.infer<typeof EnvSchema>;
let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  if (parsed.data.AI_ENABLED) {
    if (!parsed.data.AI_PROVIDER_URL || !parsed.data.AI_API_KEY || !parsed.data.AI_MODEL) {
      console.error('AI_ENABLED=true requires AI_PROVIDER_URL, AI_API_KEY, and AI_MODEL.');
      process.exit(1);
    }
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
    console.error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ in production.');
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}

export const env = loadEnv();