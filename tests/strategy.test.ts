import { describe, expect, it } from 'vitest';
import { analyzeMarket } from '../src/server/strategy';

describe('adaptive market indicators', () => {
  it('summarizes trend, momentum, and volatility from candle history', () => {
    const candles = Array.from({ length: 60 }, (_, index) => {
      const close = 1 + index * 0.001;
      return {
        time: index * 60,
        open: close - 0.0002,
        high: close + 0.001,
        low: close - 0.001,
        close,
      };
    });

    const analysis = analyzeMarket(candles);

    expect(analysis.trend).toBe('up');
    expect(analysis.ema50).toBeGreaterThan(0);
    expect(analysis.rsi14).toBe(100);
    expect(analysis.atr14Percent).toBeGreaterThan(0);
    expect(analysis.returnStdDev20Percent).not.toBeNull();
    expect(analysis.latestRangeToAtr).toBeGreaterThan(0);
  });
});
