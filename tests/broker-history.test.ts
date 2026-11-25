import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getAccountDeals: vi.fn(),
  getOpenPositions: vi.fn(),
}));

vi.mock('../src/server/db', () => ({ query: mocks.query }));
vi.mock('../src/server/fxapis', () => ({
  getAccountDeals: mocks.getAccountDeals,
  getOpenPositions: mocks.getOpenPositions,
}));
vi.mock('../src/server/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { aggregateClosedFxApisTrades, syncFxApisTradeHistory } from '../src/server/broker-history';
import type { FxApiDeal } from '../src/server/fxapis';

function deal(overrides: Partial<FxApiDeal>): FxApiDeal {
  return {
    brokerDealId: 'deal',
    brokerPositionId: 'position-1',
    symbol: 'EURUSD',
    dealType: 'buy',
    entry: 'in',
    volume: 0.1,
    price: 1.1,
    profit: 0,
    commission: 0,
    swap: 0,
    fee: 0,
    dealtAt: '2026-01-01T10:00:00Z',
    ...overrides,
  };
}

describe('FXAPIs closed trade aggregation', () => {
  it('imports closed broker history across cursor pages', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: 'account-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'account-1', provider_account_id: 'fx-account-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'bot-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'symbol-1', broker_symbol: 'EURUSD' }] })
      .mockResolvedValueOnce({ rows: [] });
    mocks.getOpenPositions.mockResolvedValue([]);
    mocks.getAccountDeals
      .mockResolvedValueOnce({
        deals: [deal({ brokerDealId: 'entry-1' })],
        hasMore: true,
        nextCursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        deals: [deal({
          brokerDealId: 'exit-1',
          dealType: 'sell',
          entry: 'out',
          price: 1.2,
          profit: 10,
          dealtAt: '2026-01-01T10:01:00Z',
        })],
        hasMore: false,
        nextCursor: null,
      });

    await expect(syncFxApisTradeHistory('user-1')).resolves.toEqual({
      imported: 1,
      failedAccounts: 0,
    });

    expect(mocks.getAccountDeals).toHaveBeenNthCalledWith(1, 'fx-account-1', undefined);
    expect(mocks.getAccountDeals).toHaveBeenNthCalledWith(2, 'fx-account-1', 'cursor-2');
    const insertCall = mocks.query.mock.calls[4] as [string, unknown[]];
    expect(insertCall[0]).toContain('ON CONFLICT (broker_account_id, broker_ticket) DO UPDATE');
    expect(insertCall[1]).toContain('position-1');
    expect(insertCall[1]).toContain(10);
  });

  it('aggregates realized profit and broker costs using all position deals', () => {
    const trades = aggregateClosedFxApisTrades([
      deal({ brokerDealId: 'open-1', volume: 0.1, price: 1.1 }),
      deal({
        brokerDealId: 'open-2',
        volume: 0.1,
        price: 1.2,
        dealtAt: '2026-01-01T10:01:00Z',
      }),
      deal({
        brokerDealId: 'close-1',
        dealType: 'sell',
        entry: 'out',
        volume: 0.2,
        price: 1.3,
        profit: 10,
        commission: -0.5,
        swap: -0.25,
        fee: -0.1,
        dealtAt: '2026-01-01T10:02:00Z',
      }),
      deal({
        brokerDealId: 'other-open',
        brokerPositionId: 'position-open',
      }),
      deal({
        brokerDealId: 'deposit',
        brokerPositionId: null,
        dealType: 'balance',
        entry: null,
      }),
    ], new Set(['position-open']));

    expect(trades).toEqual([{
      brokerTicket: 'position-1',
      symbol: 'EURUSD',
      side: 'buy',
      volume: 0.2,
      entryPrice: 1.15,
      closePrice: 1.3,
      openedAt: '2026-01-01T10:00:00Z',
      closedAt: '2026-01-01T10:02:00Z',
      realizedPl: 9.15,
      commission: -0.5,
      swap: -0.25,
    }]);
  });

  it('does not classify open positions or non-trade account deals as closed trades', () => {
    const trades = aggregateClosedFxApisTrades([
      deal({ brokerPositionId: null, dealType: 'balance', entry: null }),
      deal({ entry: 'in' }),
      deal({
        brokerDealId: 'partial-close',
        entry: 'out',
        dealType: 'sell',
        volume: 0.05,
        dealtAt: '2026-01-01T10:01:00Z',
      }),
    ], new Set(['position-1']));

    expect(trades).toEqual([]);
  });

  it('keeps realized P/L unavailable when FXAPIs omits closing profit data', () => {
    const trades = aggregateClosedFxApisTrades([
      deal({ brokerDealId: 'entry' }),
      deal({
        brokerDealId: 'exit',
        dealType: 'sell',
        entry: 'out',
        profit: null,
        dealtAt: '2026-01-01T10:01:00Z',
      }),
    ], new Set());

    expect(trades[0]?.realizedPl).toBeNull();
  });
});
