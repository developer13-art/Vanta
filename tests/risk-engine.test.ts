import { describe, it, expect } from 'vitest';
import { checkEntry, isWithinSession } from '../src/server/risk-engine';
import type { RiskLimits, AccountSnapshot, EntryRequest } from '../src/server/risk-engine';

const baseLimits: RiskLimits = {
  maxConcurrentPositions: 3,
  maxLot: 1.0,
  dailyLossLimit: 100,
  drawdownLimit: 200,
  marginUtilizationLimit: 80,
  maxSpreadPoints: 50,
};

const baseAccount: AccountSnapshot = {
  equity: 10_000,
  balance: 10_000,
  freeMargin: 9_000,
  usedMargin: 1_000,
  marginLevel: 1000,
  openPositions: 0,
  aggregateLots: 0,
  dailyRealizedLoss: 0,
  peakEquity: 10_000,
};

const baseRequest: EntryRequest = {
  lotSize: 0.1,
  currentSpreadPoints: 20,
  now: new Date('2025-01-06T12:00:00Z'), // Monday noon UTC
  tradingSessions: null,
};

describe('risk-engine.checkEntry', () => {
  it('approves a valid entry', () => {
    expect(checkEntry(baseRequest, baseAccount, baseLimits)).toEqual({ outcome: 'approved' });
  });

  it('rejects invalid lot size', () => {
    expect(checkEntry({ ...baseRequest, lotSize: 0 }, baseAccount, baseLimits))
      .toEqual({ outcome: 'rejected', reason: 'invalid_lot_size' });
  });

  it('rejects lot exceeding max', () => {
    expect(checkEntry({ ...baseRequest, lotSize: 2 }, baseAccount, baseLimits))
      .toEqual({ outcome: 'rejected', reason: 'exceeds_max_lot' });
  });

  it('rejects when max concurrent positions reached', () => {
    expect(checkEntry(baseRequest, { ...baseAccount, openPositions: 3 }, baseLimits))
      .toEqual({ outcome: 'rejected', reason: 'max_concurrent_positions_reached' });
  });

  it('rejects when daily loss limit reached', () => {
    expect(checkEntry(baseRequest, { ...baseAccount, dailyRealizedLoss: 100 }, baseLimits))
      .toEqual({ outcome: 'rejected', reason: 'daily_loss_limit_reached' });
  });

  it('rejects when drawdown limit reached', () => {
    expect(checkEntry(baseRequest, { ...baseAccount, equity: 9_790, peakEquity: 10_000 }, baseLimits))
      .toEqual({ outcome: 'rejected', reason: 'drawdown_limit_reached' });
  });

  it('rejects when margin utilization exceeded', () => {
    expect(checkEntry(baseRequest, { ...baseAccount, usedMargin: 8_500, equity: 10_000 }, baseLimits))
      .toEqual({ outcome: 'rejected', reason: 'margin_utilization_exceeded' });
  });

  it('rejects when spread too high', () => {
    expect(checkEntry({ ...baseRequest, currentSpreadPoints: 100 }, baseAccount, baseLimits))
      .toEqual({ outcome: 'rejected', reason: 'spread_too_high' });
  });

  it('rejects when outside trading session', () => {
    expect(checkEntry({
      ...baseRequest,
      now: new Date('2025-01-06T22:00:00Z'),
      tradingSessions: { mon: [['08:00', '17:00']] },
    }, baseAccount, baseLimits)).toEqual({ outcome: 'rejected', reason: 'outside_trading_session' });
  });

  it('rejects when no free margin', () => {
    expect(checkEntry(baseRequest, { ...baseAccount, freeMargin: 0 }, baseLimits))
      .toEqual({ outcome: 'rejected', reason: 'no_free_margin' });
  });
});

describe('risk-engine.isWithinSession', () => {
  it('returns true inside a same-day window', () => {
    const now = new Date('2025-01-06T10:00:00Z'); // Monday
    expect(isWithinSession(now, { mon: [['08:00', '17:00']] })).toBe(true);
  });

  it('returns false outside a same-day window', () => {
    const now = new Date('2025-01-06T18:00:00Z');
    expect(isWithinSession(now, { mon: [['08:00', '17:00']] })).toBe(false);
  });

  it('handles overnight windows', () => {
    const late = new Date('2025-01-06T23:00:00Z');
    const early = new Date('2025-01-06T02:00:00Z');
    expect(isWithinSession(late, { mon: [['22:00', '04:00']] })).toBe(true);
    expect(isWithinSession(early, { mon: [['22:00', '04:00']] })).toBe(true);
  });

  it('returns false when day has no sessions', () => {
    const now = new Date('2025-01-06T10:00:00Z'); // Monday
    expect(isWithinSession(now, { tue: [['08:00', '17:00']] })).toBe(false);
  });
});