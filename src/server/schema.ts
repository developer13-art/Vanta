import { z } from 'zod';

export const emailSchema = z.string().email().max(254).transform((v) => v.toLowerCase().trim());
export const passwordSchema = z.string().min(10).max(128);
export const nameSchema = z.string().min(1).max(120).trim();
export const countrySchema = z.string().min(2).max(2);

export const signupSchema = z.object({
  fullName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  country: countrySchema,
  acceptTerms: z.literal(true),
  acceptRisk: z.literal(true),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  mfaCode: z.string().length(6).optional(),
});

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(500) });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(500),
  newPassword: passwordSchema,
});

export const connectBrokerSchema = z.object({
  label: nameSchema,
  brokerName: nameSchema,
  server: nameSchema,
  login: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
  mode: z.enum(['demo', 'live']),
});

export const createBotSchema = z.object({
  brokerAccountId: z.string().uuid(),
  name: nameSchema,
  strategyName: z.string().min(1),
  strategyParams: z.record(z.unknown()).default({}),
  brokerSymbolIds: z.array(z.string().uuid()).min(1).max(20),
  lotSize: z.number().positive(),
  entryBatchSize: z.number().int().min(1).max(20),
  maxConcurrentPositions: z.number().int().min(1).max(50),
  dailyLossLimit: z.number().positive(),
  drawdownLimit: z.number().positive(),
  marginUtilizationLimit: z.number().min(1).max(100),
  maxSpreadPoints: z.number().int().min(0).optional(),
  cooldownSeconds: z.number().int().min(0).max(86_400),
  stopBehavior: z.enum(['stop_new_manage_existing', 'close_all_and_stop', 'emergency_halt']),
});

export const closePositionsSchema = z.object({
  positionIds: z.array(z.string().uuid()).min(1).max(100),
});

export const closeAllSchema = z.object({
  brokerAccountId: z.string().uuid(),
  confirmPhrase: z.literal('CLOSE ALL'),
});

export const purchaseSchema = z.object({
  packageCode: z.enum(['starter', 'basic', 'trader', 'pro', 'advanced', 'expert', 'elite']),
});

export const notificationListSchema = z.object({
  category: z.enum(['trading', 'broker', 'wallet', 'security', 'system']).optional(),
  unreadOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const settingsProfileSchema = z.object({
  fullName: nameSchema.optional(),
  country: countrySchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});