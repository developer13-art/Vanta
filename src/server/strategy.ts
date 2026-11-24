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
    const value = values[i];
    if (value === undefined) throw new Error('EMA input is incomplete');
    prev = value * k + prev * (1 - k);
  }
  return prev;
}

function relativeChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function rsi(closes: number[], period: number): number | null {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let index = closes.length - period; index < closes.length; index++) {
    const current = closes[index];
    const previous = closes[index - 1];
    if (current === undefined || previous === undefined) throw new Error('RSI input is incomplete');
    const change = current - previous;
    if (change > 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return gains === 0 ? 50 : 100;
  const relativeStrength = (gains / period) / (losses / period);
  return 100 - (100 / (1 + relativeStrength));
}

export function analyzeMarket(candles: Candle[]): Record<string, number | string | null> {
  const closes = candles.map((candle) => candle.close);
  const latest = candles[candles.length - 1];
  if (!latest || latest.close <= 0) throw new Error('A valid latest candle is required for market analysis');

  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  let trend = 'mixed';
  if (ema9 !== null && ema21 !== null && ema50 !== null) {
    if (ema9 > ema21 && ema21 > ema50) trend = 'up';
    else if (ema9 < ema21 && ema21 < ema50) trend = 'down';
  }

  const recent = candles.slice(-20);
  const recentCloses = closes.slice(-21);
  const returns = recentCloses.slice(1).map((close, index) => {
    const previous = recentCloses[index];
    return previous !== undefined && previous > 0 ? (close - previous) / previous : 0;
  });
  const meanReturn = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const returnStdDevPercent = returns.length
    ? Math.sqrt(returns.reduce((sum, value) => sum + ((value - meanReturn) ** 2), 0) / returns.length) * 100
    : null;

  const atrCandles = candles.slice(-15);
  const trueRanges = atrCandles.slice(1).map((candle, index) => {
    const previousClose = atrCandles[index]?.close;
    if (previousClose === undefined) throw new Error('ATR input is incomplete');
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
  const atr = trueRanges.length ? trueRanges.reduce((sum, value) => sum + value, 0) / trueRanges.length : null;
  const latestTrueRange = Math.max(
    latest.high - latest.low,
    Math.abs(latest.high - (candles[candles.length - 2]?.close ?? latest.close)),
    Math.abs(latest.low - (candles[candles.length - 2]?.close ?? latest.close)),
  );
  const rangeHigh = Math.max(...recent.map((candle) => candle.high));
  const rangeLow = Math.min(...recent.map((candle) => candle.low));

  return {
    lastClose: latest.close,
    change1CandlePercent: relativeChange(latest.close, closes[closes.length - 2]),
    change5CandlesPercent: relativeChange(latest.close, closes[closes.length - 6]),
    change15CandlesPercent: relativeChange(latest.close, closes[closes.length - 16]),
    ema9,
    ema21,
    ema50,
    trend,
    rsi14: rsi(closes, 14),
    atr14Percent: atr === null ? null : (atr / latest.close) * 100,
    returnStdDev20Percent: returnStdDevPercent,
    range20Percent: ((rangeHigh - rangeLow) / latest.close) * 100,
    latestRangeToAtr: atr && atr > 0 ? latestTrueRange / atr : null,
  };
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
    if (price === undefined) {
      return { verdict: 'NO_TRADE', confidence: 0, reason: 'insufficient_history', meta: {} };
    }
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