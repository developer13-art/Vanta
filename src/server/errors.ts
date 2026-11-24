export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  badRequest: (msg: string, details?: unknown) => new AppError('BAD_REQUEST', 400, msg, details),
  unauthorized: (msg = 'Authentication required') => new AppError('UNAUTHORIZED', 401, msg),
  forbidden: (msg = 'Forbidden') => new AppError('FORBIDDEN', 403, msg),
  notFound: (msg = 'Resource not found') => new AppError('NOT_FOUND', 404, msg),
  conflict: (msg: string, details?: unknown) => new AppError('CONFLICT', 409, msg, details),
  unprocessable: (msg: string, details?: unknown) => new AppError('UNPROCESSABLE', 422, msg, details),
  tooMany: (msg = 'Too many requests') => new AppError('RATE_LIMITED', 429, msg),
  internal: (msg = 'Internal server error') => new AppError('INTERNAL', 500, msg),
  unavailable: (msg = 'Service unavailable') => new AppError('UNAVAILABLE', 503, msg),
  planRequired: (msg: string) => new AppError('PLAN_REQUIRED', 402, msg),
  insufficientCredits: () => new AppError('INSUFFICIENT_CREDITS', 402, 'Insufficient credits'),
  riskRejected: (reason: string) => new AppError('RISK_REJECTED', 422, reason),
};