import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  query: vi.fn(),
  fetchBrokerCandles: vi.fn(),
  fetchBrokerQuotes: vi.fn(),
  getBrokerHealth: vi.fn(),
  submitOrder: vi.fn(),
  closePosition: vi.fn(),
  isHalted: vi.fn().mockResolvedValue({ halted: false }),
  logger: { info: vi.fn(), warn: vi.fn() },
}));

vi.mock('../src/server/db', () => ({ query: state.query }));
vi.mock('../src/server/logger', () => ({ logger: state.logger }));
vi.mock('../src/server/broker-providers', () => ({
  fetchBrokerCandles: state.fetchBrokerCandles,
  fetchBrokerQuotes: state.fetchBrokerQuotes,
  getBrokerHealth: state.getBrokerHealth,
}));
vi.mock('../src/server/execution', () => ({
  closePosition: state.closePosition,
  submitOrder: state.submitOrder,
}));
vi.mock('../src/server/admin-emergency', () => ({ isHalted: state.isHalted }));

import { runBotTick } from '../src/server/bot-engine';

describe('bot analysis ticks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM bots b')) {
        return { rows: [{
          id: 'bot-1',
          user_id: 'user-1',
          broker_account_id: 'account-1',
          name: 'Demo bot',
          state: 'running',
          is_live: false,
          account_mode: 'demo',
          trading_enabled: false,
          connection_provider: 'fxapis',
          provider_account_id: 'provider-account-1',
          strategy_version_id: 'strategy-version-1',
          strategy_name: 'ema_crossover',
          strategy_params: { fastPeriod: 9, slowPeriod: 21, minSpreadPoints: 30 },
          lot_size: '0.01',
          entry_batch_size: 1,
          max_concurrent_positions: 1,
          daily_loss_limit: '50',
          drawdown_limit: '100',
          margin_utilization_limit: '50',
          max_spread_points: 30,
          cooldown_seconds: 60,
          trading_sessions: null,
          peak_equity: '1000',
        }] };
      }
      if (sql.includes('FROM bot_instruments')) {
        return { rows: [{
          id: 'symbol-1',
          broker_symbol: 'EURUSD.a',
          canonical_symbol: 'EURUSD',
          digits: 5,
          min_volume: '0.01',
          max_volume: '100',
          volume_step: '0.01',
          is_tradable: false,
        }] };
      }
      if (sql.includes('SELECT id FROM ai_decisions')) return { rows: [] };
      return { rows: [] };
    });
  });

  it('records why a broker-reported non-tradable symbol is skipped and never submits an order', async () => {
    await runBotTick('bot-1');

    const insert = state.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO ai_decisions'));
    expect(insert?.[1]).toEqual(expect.arrayContaining(['NO_TRADE']));
    expect(insert?.[1]).toEqual(expect.arrayContaining([
      'The broker reports that this instrument cannot be traded on this account.',
    ]));
    expect(state.fetchBrokerCandles).not.toHaveBeenCalled();
    expect(state.fetchBrokerQuotes).not.toHaveBeenCalled();
    expect(state.submitOrder).not.toHaveBeenCalled();
  });

  it('submits a strategy signal only after fresh quotes, live account health, and risk approval', async () => {
    state.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM bots b')) {
        return { rows: [{
          id: 'bot-1',
          user_id: 'user-1',
          broker_account_id: 'account-1',
          name: 'Demo bot',
          state: 'running',
          is_live: false,
          account_mode: 'demo',
          trading_enabled: false,
          connection_provider: 'fxapis',
          provider_account_id: 'provider-account-1',
          strategy_version_id: 'strategy-version-1',
          strategy_name: 'ema_crossover',
          strategy_params: { fastPeriod: 9, slowPeriod: 21, minSpreadPoints: 30 },
          lot_size: '0.01',
          entry_batch_size: 1,
          max_concurrent_positions: 1,
          daily_loss_limit: '50',
          drawdown_limit: '100',
          margin_utilization_limit: '50',
          max_spread_points: 30,
          cooldown_seconds: 60,
          trading_sessions: null,
          peak_equity: '1000',
        }] };
      }
      if (sql.includes('FROM bot_instruments')) {
        return { rows: [{
          id: 'symbol-1',
          broker_symbol: 'EURUSD.a',
          canonical_symbol: 'EURUSD',
          digits: 5,
          min_volume: '0.01',
          max_volume: '100',
          volume_step: '0.01',
          is_tradable: true,
        }] };
      }
      if (sql.includes('SELECT id FROM ai_decisions')) return { rows: [] };
      if (sql.includes('AS open_positions')) return { rows: [{ open_positions: 0, aggregate_lots: 0 }] };
      if (sql.includes('AS daily_loss')) return { rows: [{ daily_loss: 0 }] };
      if (sql.includes('FROM risk_limits')) return { rows: [] };
      if (sql.includes('FROM orders')) return { rows: [] };
      if (sql.includes('SELECT state FROM bots')) return { rows: [{ state: 'running' }] };
      return { rows: [] };
    });

    const now = Math.floor(Date.now() / 300_000) * 300 - 300;
    const closes = Array.from({ length: 22 }, (_, index) => 1.2 - index * 0.001);
    closes.push(1.4);
    state.fetchBrokerCandles.mockResolvedValue(closes.map((close, index) => ({
      time: now - (closes.length - index - 1) * 300,
      open: close,
      high: close + 0.001,
      low: close - 0.001,
      close,
      volume: 100,
    })));
    state.fetchBrokerQuotes.mockResolvedValue([{
      symbol: 'EURUSD.a',
      status: 'ok',
      bid: 1.3999,
      ask: 1.4,
      spreadPoints: 10,
      time: new Date().toISOString(),
      stale: false,
      marketOpen: true,
      tradeMode: 'full',
    }]);
    state.getBrokerHealth.mockResolvedValue({
      status: 'connected',
      detail: null,
      info: {
        balance: 1000,
        equity: 1000,
        freeMargin: 1000,
        usedMargin: 0,
        marginLevel: 1000,
        currency: 'USD',
        leverage: 100,
        isHedging: true,
      },
    });
    state.submitOrder.mockResolvedValue({ orderId: 'order-1', brokerTicket: 'ticket-1', status: 'accepted' });

    await runBotTick('bot-1');

    expect(state.submitOrder).toHaveBeenCalledWith(expect.objectContaining({
      side: 'buy',
      volume: 0.01,
      providerAccountId: 'provider-account-1',
    }));
    const decisionInsert = state.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO ai_decisions'));
    expect(decisionInsert?.[1]).toEqual(expect.arrayContaining(['BUY']));
  });
});
