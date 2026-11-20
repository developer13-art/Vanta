// Deterministic strategy engine. No AI. Produces BUY | SELL | NO_TRADE
// from candles. Strategy versions are registered in strategy_versions table.

export interface Candle {
  time: number;   // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface StrategyContext {
  candles: Candle[];        // oldest -> newest
  spreadPoints: number | null;
  symbolDigits: number;
}

export type Verdict = 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE';

export interface StrategySignal {
  verdict: Verdict;
  confidence: number;
  reason: string;
  meta: Record<string, unknown>;
}

export interface StrategyDefinition {
  name: string;
  version: string;
  paramsSchema: Record<string, unknown>;
  defaultParams: Record<string, unknown>;
  evaluate: (ctx: StrategyContext, params: Record<string, unknown>) => StrategySignal;
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

export const emaCrossoverStrategy: StrategyDefinition = {
  name: 'ema_crossover',
  version: '1.0.0',
  paramsSchema: {
    type: 'object',
    properties: {
      fastPeriod: { type: 'integer', minimum: 2, maximum: 100 },
      slowPeriod: { type: 'integer', minimum: 5, maximum: 300 },
      minSpreadPoints: { type: 'integer', minimum: 0 },
    },
  },
  defaultParams: { fastPeriod: 9, slowPeriod: 21, minSpreadPoints: 30 },
  evaluate(ctx, rawParams) {
    const params = {
      fastPeriod: 9,
      slowPeriod: 21,
      minSpreadPoints: 30,
      ...rawParams,
    } as { fastPeriod: number; slowPeriod: number; minSpreadPoints: number };

    if (params.fastPeriod >= params.slowPeriod) {
      return { verdict: 'NO_TRADE', confidence: 0, reason: 'invalid_params', meta: {} };
    }
    if (ctx.candles.length < params.slowPeriod + 2) {
      return { verdict: 'NO_TRADE', confidence: 0, reason: 'insufficient_history', meta: {} };
    }
    if (ctx.spreadPoints !== null && ctx.spreadPoints > params.minSpreadPoints * 3) {
      return { verdict: 'NO_TRADE', confidence: 0, reason: 'spread_too_wide', meta: { spread: ctx.spreadPoints } };
    }

    // Evaluate on the most recent close
    const closes = ctx.candles.map((c) => c.close);
    const closesPrev = closes.slice(0, -1);

    const fastNow = ema(closes, params.fastPeriod);
    const slowNow = ema(closes, params.slowPeriod);
    const fastPrev = ema(closesPrev, params.fastPeriod);
    const slowPrev = ema(closesPrev, params.slowPeriod);

    if (fastNow === null || slowNow === null || fastPrev === null || slowPrev === null) {
      return { verdict: 'NO_TRADE', confidence: 0, reason: 'insufficient_history', meta: {} };
    }

    const bullishCross = fastPrev <= slowPrev && fastNow > slowNow;
    const bearishCross = fastPrev >= slowPrev && fastNow < slowNow;

    const delta = Math.abs(fastNow - slowNow);
    const price = closes[closes.length - 1];
    const normalizedDelta = price > 0 ? delta / price : 0;
    const confidence = Math.min(1, Math.max(0, normalizedDelta * 2000));

    const meta = {
      fastEma: fastNow,
      slowEma: slowNow,
      fastEmaPrev: fastPrev,
      slowEmaPrev: slowPrev,
      lastClose: price,
      spreadPoints: ctx.spreadPoints,
    };

    if (bullishCross) return { verdict: 'BUY', confidence, reason: 'bullish_cross', meta };
    if (bearishCross) return { verdict: 'SELL', confidence, reason: 'bearish_cross', meta };
    return { verdict: 'HOLD', confidence: 0, reason: 'no_cross', meta };
  },
};

const REGISTRY: Record<string, StrategyDefinition> = {
  [emaCrossoverStrategy.name]: emaCrossoverStrategy,
};

export function getStrategy(name: string): StrategyDefinition | null {
  return REGISTRY[name] ?? null;
}

export function listStrategies(): StrategyDefinition[] {
  return Object.values(REGISTRY);
}