import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: { FXAPIS_API_KEY: 'fx_test_key', METAAPI_TOKEN: 'metaapi-token' },
  connectFxApisAccount: vi.fn().mockResolvedValue('fx-account'),
  provisionAccount: vi.fn().mockResolvedValue('meta-account'),
  placeMarketOrder: vi.fn(),
  getFxApisOrder: vi.fn(),
  getFxApisPositions: vi.fn(),
}));

vi.mock('../src/server/env', () => ({ env: state.env }));
vi.mock('../src/server/fxapis', () => ({
  FxApisError: class FxApisError extends Error {},
  closePosition: vi.fn(),
  connectAccount: state.connectFxApisAccount,
  disconnectAccount: vi.fn(),
  getAccountFigures: vi.fn(),
  getAccountState: vi.fn(),
  getCandles: vi.fn(),
  getOpenPositions: state.getFxApisPositions,
  getOrder: state.getFxApisOrder,
  getSymbols: vi.fn(),
  placeMarketOrder: state.placeMarketOrder,
}));
vi.mock('../src/server/metaapi', () => ({
  fetchAccountInformation: vi.fn(),
  fetchCandles: vi.fn(),
  fetchOpenPositions: vi.fn(),
  fetchSymbols: vi.fn(),
  provisionAccount: state.provisionAccount,
  submitMarketOrder: vi.fn(),
}));

import {
  connectBrokerAccount,
  resolveFxApisOrder,
  getBrokerProviderOptions,
  getDefaultBrokerProvider,
  isBrokerProviderAvailable,
  submitBrokerMarketOrder,
} from '../src/server/broker-providers';

describe('broker provider selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.env.FXAPIS_API_KEY = 'fx_test_key';
  });

  it('defaults MT5 to FXAPIs while retaining MetaApi and MT4 support', () => {
    expect(getBrokerProviderOptions()).toEqual({
      providers: [
        { id: 'fxapis', label: 'FXAPIs', platforms: ['mt5'] },
        { id: 'metaapi', label: 'MetaApi', platforms: ['mt4', 'mt5'] },
      ],
      defaultProvider: 'fxapis',
    });
    expect(getDefaultBrokerProvider('mt5')).toBe('fxapis');
    expect(getDefaultBrokerProvider('mt4')).toBe('metaapi');
    expect(isBrokerProviderAvailable('fxapis', 'mt4')).toBe(false);
  });

  it('routes FXAPIs connections only through its MT5 adapter', async () => {
    await expect(connectBrokerAccount('fxapis', {
      login: '10001', password: 'pass', server: 'Broker-Demo', label: 'Demo', platform: 'mt5',
    })).resolves.toBe('fx-account');
    expect(state.connectFxApisAccount).toHaveBeenCalledOnce();
    expect(state.provisionAccount).not.toHaveBeenCalled();
  });

  it('routes MetaApi connections through its MT4-capable adapter', async () => {
    await expect(connectBrokerAccount('metaapi', {
      login: '10002', password: 'pass', server: 'Broker-Demo', label: 'MT4 Demo', platform: 'mt4',
    })).resolves.toBe('meta-account');
    expect(state.provisionAccount).toHaveBeenCalledWith(expect.objectContaining({ platform: 'mt4' }));
  });

  it('does not confirm FXAPIs orders without a real fill price and volume', async () => {
    state.placeMarketOrder.mockResolvedValue({
      id: 'fx-order',
      state: 'filled',
      stateDetail: null,
      brokerPositionId: 'fx-position',
      brokerOrderId: 'broker-order',
      filledPrice: null,
      filledVolume: null,
    });

    await expect(submitBrokerMarketOrder('fxapis', 'fx-account', {
      symbol: 'EURUSD', side: 'buy', volume: 0.1, comment: 'vanta:order', clientId: 'order',
    }, 'idempotency-key')).resolves.toMatchObject({ status: 'unknown', ticket: 'fx-position' });

    state.getFxApisOrder.mockResolvedValue({
      id: 'fx-order',
      state: 'filled',
      stateDetail: null,
      brokerPositionId: 'fx-position',
      brokerOrderId: 'broker-order',
      filledPrice: null,
      filledVolume: null,
    });
    state.getFxApisPositions.mockResolvedValue([{
      id: 'fx-position', symbol: 'EURUSD', side: 'buy', volume: 0.1,
      openPrice: 1.12, currentPrice: 1.13, profit: 1,
    }]);

    await expect(resolveFxApisOrder('fx-account', 'fx-order'))
      .resolves.toMatchObject({ status: 'accepted', ticket: 'fx-position', price: 1.12, volume: 0.1 });
  });
});
