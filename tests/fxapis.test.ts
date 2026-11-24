import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: {
    FXAPIS_API_KEY: 'fx_test_key',
    FXAPIS_API_BASE_URL: 'https://api.fxapis.test',
  },
  fetch: vi.fn(),
}));

vi.mock('../src/server/env', () => ({ env: state.env }));
vi.mock('../src/server/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  connectAccount,
  getCandles,
  getSymbols,
  placeMarketOrder,
} from '../src/server/fxapis';

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('FXAPIs integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', state.fetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('connects MT5 accounts and starts the remote terminal', async () => {
    state.fetch
      .mockResolvedValueOnce(response({ data: { id: 'fx-account-1' } }, 201))
      .mockResolvedValueOnce(response({ data: { accountId: 'fx-account-1', state: 'starting' } }, 202));

    await expect(connectAccount({
      login: '12345',
      password: 'secret',
      server: 'Broker-Demo',
      label: 'Demo',
    })).resolves.toBe('fx-account-1');

    const [createUrl, createInit] = state.fetch.mock.calls[0] as [string, RequestInit];
    expect(createUrl).toBe('https://api.fxapis.test/v1/accounts');
    expect(createInit.headers).toMatchObject({ Authorization: 'Bearer fx_test_key' });
    expect(JSON.parse(String(createInit.body))).toMatchObject({ platform: 'mt5', mode: 'always_on' });
    expect(state.fetch.mock.calls[1]?.[0]).toBe('https://api.fxapis.test/v1/accounts/fx-account-1/warm');
  });

  it('normalizes symbols and candles from FXAPIs responses', async () => {
    state.fetch
      .mockResolvedValueOnce(response({
        data: [{ name: 'EURUSD.a', description: 'Euro vs US Dollar', digits: 5, volumeMin: 0.01, volumeStep: 0.01, tradable: true }],
      }))
      .mockResolvedValueOnce(response({
        data: {
          candles: [{
            time: '2026-11-24T10:00:00Z', open: '1.1', high: '1.2', low: '1.0', close: '1.15', tickVolume: 52,
          }],
        },
      }));

    await expect(getSymbols('fx-account-1')).resolves.toMatchObject([
      { symbol: 'EURUSD.a', digits: 5, minVolume: 0.01, tradable: true },
    ]);
    await expect(getCandles('fx-account-1', 'EURUSD.a', '15m', 100)).resolves.toEqual([
      { time: 1795514400, open: 1.1, high: 1.2, low: 1, close: 1.15, volume: 52 },
    ]);
    expect(String(state.fetch.mock.calls[1]?.[0])).toContain('timeframe=M15');
  });

  it('sends decimal-string volumes and idempotency keys for orders', async () => {
    state.fetch.mockResolvedValueOnce(response({
      data: {
        id: 'fx-order-1', state: 'filled', brokerPositionId: 'position-1',
        filledPrice: '1.12345', filledVolume: '0.1',
      },
    }, 201));

    await expect(placeMarketOrder({
      accountId: 'fx-account-1',
      symbol: 'EURUSD',
      side: 'buy',
      volume: 0.1,
      comment: 'vanta:order',
      clientOrderId: 'order-1',
      idempotencyKey: 'key-1',
    })).resolves.toMatchObject({ id: 'fx-order-1', state: 'filled', brokerPositionId: 'position-1' });

    const [, init] = state.fetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'Idempotency-Key': 'key-1' });
    expect(JSON.parse(String(init.body))).toMatchObject({ volume: '0.1000', side: 'buy' });
  });

  it('preserves unresolved order IDs instead of treating timeouts as rejections', async () => {
    state.fetch.mockResolvedValueOnce(response({
      error: {
        code: 'ORDER_UNRESOLVED',
        message: 'The result is being confirmed.',
        details: [{ orderId: 'fx-order-unresolved' }],
      },
    }, 503));

    await expect(placeMarketOrder({
      accountId: 'fx-account-1',
      symbol: 'EURUSD',
      side: 'sell',
      volume: 0.1,
      comment: 'vanta:order',
      clientOrderId: 'order-2',
      idempotencyKey: 'key-2',
    })).resolves.toMatchObject({ id: 'fx-order-unresolved', state: 'unknown' });
  });
});
