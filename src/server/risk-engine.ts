// Pure functions. No DB, no network, no side effects. Independently testable.

export interface RiskLimits {
  maxConcurrentPositions: number;
  maxLot: number;
  dailyLossLimit: number;
  drawdownLimit: number;
  marginUtilizationLimit: number; // percent 1-100
  maxSpreadPoints: number | null;
}

export interface AccountSnapshot {
  equity: number;
  balance: number;
  freeMargin: number;
  usedMargin: number;
  marginLevel: number | null;
  openPositions: number;
  aggregateLots: number;
  dailyRealizedLoss: number; // positive number = loss amount
  peakEquity: number;
}

export interface EntryRequest {
  lotSize: number;
  currentSpreadPoints: number | null;
  now: Date;
  tradingSessions: Record<string, Array<[string, string]>> | null; // e.g. {mon: [["08:00","17:00"]]}
}

export type RiskVerdict =
  | { outcome: 'approved' }
  | { outcome: 'rejected'; reason: string };

export function checkEntry(
  req: EntryRequest,
  account: AccountSnapshot,
  limits: RiskLimits,
): RiskVerdict {
  if (req.lotSize <= 0) return { outcome: 'rejected', reason: 'invalid_lot_size' };
  if (req.lotSize > limits.maxLot) return { outcome: 'rejected', reason: 'exceeds_max_lot' };

  if (account.openPositions >= limits.maxConcurrentPositions)
    return { outcome: 'rejected', reason: 'max_concurrent_positions_reached' };

  if (account.aggregateLots + req.lotSize > limits.maxLot * limits.maxConcurrentPositions)
    return { outcome: 'rejected', reason: 'aggregate_exposure_exceeded' };

  if (account.dailyRealizedLoss >= limits.dailyLossLimit)
    return { outcome: 'rejected', reason: 'daily_loss_limit_reached' };

  if (limits.drawdownLimit > 0) {
    const peak = Math.max(account.peakEquity, account.equity);
    const drawdown = peak - account.equity;
    if (drawdown >= limits.drawdownLimit)
      return { outcome: 'rejected', reason: 'drawdown_limit_reached' };
  }

  if (limits.marginUtilizationLimit < 100) {
    if (account.equity > 0) {
      const utilization = (account.usedMargin / account.equity) * 100;
      if (utilization >= limits.marginUtilizationLimit)
        return { outcome: 'rejected', reason: 'margin_utilization_exceeded' };
    }
  }

  if (account.freeMargin <= 0)
    return { outcome: 'rejected', reason: 'no_free_margin' };

  if (limits.maxSpreadPoints !== null && req.currentSpreadPoints !== null) {
    if (req.currentSpreadPoints > limits.maxSpreadPoints)
      return { outcome: 'rejected', reason: 'spread_too_high' };
  }

  if (req.tradingSessions && !isWithinSession(req.now, req.tradingSessions))
    return { outcome: 'rejected', reason: 'outside_trading_session' };

  return { outcome: 'approved' };
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function isWithinSession(
  now: Date,
  sessions: Record<string, Array<[string, string]>>,
): boolean {
  const dayKey = DAY_KEYS[now.getUTCDay()];
  const windows = sessions[dayKey];
  if (!windows || windows.length === 0) return false;
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  for (const [startStr, endStr] of windows) {
    const start = parseHhMm(startStr);
    const end = parseHhMm(endStr);
    if (start === null || end === null) continue;
    if (start <= end) {
      if (minutes >= start && minutes < end) return true;
    } else {
      // Overnight window
      if (minutes >= start || minutes < end) return true;
    }
  }
  return false;
}

function parseHhMm(s: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}