import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError, ZodSchema } from 'zod';
import { AppError, Errors } from './errors';
import { verifyAccessToken } from './auth';
import { env } from './env';
import { logger } from './logger';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      roles?: string[];
      requestId?: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.requestId = (req.header('x-request-id') ?? randomUUID()).slice(0, 100);
  res.setHeader('x-request-id', req.requestId);
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next(Errors.unauthorized());
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.roles = payload.roles;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.roles?.includes('admin')) return next(Errors.forbidden('Admin access required'));
  next();
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(Errors.unprocessable('Validation failed', err.issues));
      }
      next(err);
    }
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).validatedQuery = schema.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof ZodError) return next(Errors.unprocessable('Validation failed', err.issues));
      next(err);
    }
  };
}

// In-memory rate limiter — no Redis. Fine for single-instance deployment.
interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

export function rateLimit(opts: { windowSeconds: number; max: number; keyPrefix: string }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ip = req.ip ?? 'unknown';
    const key = `${opts.keyPrefix}:${ip}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowSeconds * 1000 });
      return next();
    }
    if (bucket.count >= opts.max) return next(Errors.tooMany());
    bucket.count += 1;
    next();
  };
}

// Periodic cleanup for rate-limit buckets
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}, 60_000).unref();

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    logger.warn(
      { requestId: req.requestId, code: err.code, statusCode: err.statusCode, details: err.details },
      err.message,
    );
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details ?? undefined },
      requestId: req.requestId,
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(422).json({
      error: { code: 'UNPROCESSABLE', message: 'Validation failed', details: err.issues },
      requestId: req.requestId,
    });
    return;
  }
  logger.error({ requestId: req.requestId, err }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Internal server error' },
    requestId: req.requestId,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  });
}

export const generalRateLimit = rateLimit({
  windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: 'rl',
});

export const authRateLimit = rateLimit({
  windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
  max: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: 'auth',
});