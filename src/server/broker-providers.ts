import { env } from './env';
import { FxApisError, closePosition as closeFxApisPosition, connectAccount as connectFxApisAccount,
  disconnectAccount as disconnectFxApisAccount, getAccountFigures, getAccountState,
  getCandles as getFxApisCandles, getOpenPositions as getFxApisPositions, getOrder as getFxApisOrder,
  getSymbols as getFxApisSymbols, placeMarketOrder as placeFxApisMarketOrder } from './fxapis';
import {
  fetchAccountInformation,
  fetchCandles,
  fetchOpenPositions,
  fetchSymbols,
  provisionAccount,
  submitMarketOrder,
} from './metaapi';
import type { BrokerPlatform, BrokerProvider } from '../shared/types';

export interface BrokerAccountInfo {
  balance: number | null;
  equity: number | null;
  freeMargin: number | null;
  usedMargin: number | null;
  marginLevel: number | null;
  currency: string | null;
  leverage: number | null;
  isHedging: boolean | null;
}

export interface BrokerSymbolSpec {
  symbol: string;
  description: string | null;
  digits: number | null;
  tickSize: number | null;
  contractSize: number | null;
  minVolume: number | null;
  maxVolume: number | null;
  volumeStep: number | null;
  tradable: boolean;
}

export interface BrokerPositionSnapshot {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  currentPrice: number | null;
  profit: number | null;
}

export interface BrokerOrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  comment: string;
  clientId: string;
}

export interface BrokerOrderResult {
  ticket: string | null;
  providerOrderId: string | null;
  price: number;
  volume: number;
  status: 'accepted' | 'rejected' | 'unknown';
  message?: string;
}

export interface BrokerProviderOption {
  id: BrokerProvider;
  label: string;
  platforms: BrokerPlatform[];
}

const FXAPIS_READY_STATES = new Set(['ready', 'executing']);
const FXAPIS_PENDING_STATES = new Set([
  'created', 'provisioning', 'standby', 'starting', 'connecting',
  'synchronizing', 'cooling', 'reconnecting',
]);

export function getBrokerProviderOptions(): {
  providers: BrokerProviderOption[];
  defaultProvider: BrokerProvider;
} {
  const providers: BrokerProviderOption[] = [];
  if (env.FXAPIS_API_KEY) providers.push({ id: 'fxapis', label: 'FXAPIs', platforms: ['mt5'] });
  providers.push({ id: 'metaapi', label: 'MetaApi', platforms: ['mt4', 'mt5'] });
  return {
    providers,
    defaultProvider: env.FXAPIS_API_KEY ? 'fxapis' : 'metaapi',
  };
}

export function getDefaultBrokerProvider(platform: BrokerPlatform): BrokerProvider {
  if (platform === 'mt5' && env.FXAPIS_API_KEY) return 'fxapis';
  return 'metaapi';
}

export function isBrokerProviderAvailable(provider: BrokerProvider, platform: BrokerPlatform): boolean {
  if (provider === 'fxapis') return Boolean(env.FXAPIS_API_KEY) && platform === 'mt5';
  return Boolean(env.METAAPI_TOKEN);
}

export async function connectBrokerAccount(
  provider: BrokerProvider,
  args: { login: string; password: string; server: string; label: string; platform: BrokerPlatform },
): Promise<string> {
  if (!isBrokerProviderAvailable(provider, args.platform)) {
    throw new FxApisError(
      provider === 'fxapis' && args.platform !== 'mt5'
        ? 'FXAPIs currently supports MT5 accounts only.'
        : `${provider === 'fxapis' ? 'FXAPIs' : 'MetaApi'} is not configured for this server.`,
      503,
      'PROVIDER_UNAVAILABLE',
    );
  }
  if (provider === 'fxapis') return connectFxApisAccount(args);
  return provisionAccount({
    login: args.login,
    password: args.password,
    server: args.server,
    name: args.label,
    platform: args.platform,
  });
}

export async function getBrokerHealth(provider: BrokerProvider, providerAccountId: string): Promise<{
  status: 'connected' | 'connecting' | 'reconnecting' | 'requires_attention';
  info: BrokerAccountInfo | null;
  detail: string | null;
}> {
  if (provider === 'metaapi') {
    const info = await fetchAccountInformation(providerAccountId);
    return {
      status: 'connected',
      info: {
        balance: info.balance,
        equity: info.equity,
        freeMargin: info.freeMargin,
        usedMargin: info.usedMargin,
        marginLevel: info.marginLevel,
        currency: info.currency,
        leverage: info.leverage,
        isHedging: info.isHedging,
      },
      detail: null,
    };
  }

  const accountState = await getAccountState(providerAccountId);
  if (FXAPIS_READY_STATES.has(accountState.state)) {
    const info = await getAccountFigures(providerAccountId);
    return { status: 'connected', info, detail: accountState.detail };
  }
  if (FXAPIS_PENDING_STATES.has(accountState.state)) {
    return {
      status: accountState.state === 'reconnecting' ? 'reconnecting' : 'connecting',
      info: null,
      detail: accountState.detail ?? `FXAPIs account is ${accountState.state}.`,
    };
  }
  return {
    status: 'requires_attention',
    info: null,
    detail: accountState.detail ?? `FXAPIs account requires attention (${accountState.state}).`,
  };
}

export async function fetchBrokerSymbols(provider: BrokerProvider, providerAccountId: string): Promise<BrokerSymbolSpec[]> {
  if (provider === 'fxapis') {
    return (await getFxApisSymbols(providerAccountId)).map((symbol) => ({
      ...symbol,
      tickSize: null,
    }));
  }
  const symbols = await fetchSymbols(providerAccountId);
  return symbols.map((symbol) => ({
    ...symbol,
    tradable: true,
  }));
}

export async function fetchBrokerPositions(
  provider: BrokerProvider,
  providerAccountId: string,
): Promise<BrokerPositionSnapshot[]> {
  if (provider === 'fxapis') return getFxApisPositions(providerAccountId);
  const positions = await fetchOpenPositions(providerAccountId);
  return positions.map((position) => ({
    id: String(position.id),
    symbol: position.symbol,
    side: position.type === 'POSITION_TYPE_BUY' ? 'buy' : 'sell',
    volume: position.volume,
    openPrice: position.openPrice,
    currentPrice: typeof position.currentPrice === 'number' ? position.currentPrice : null,
    profit: typeof position.profit === 'number' ? position.profit : null,
  }));
}

export async function fetchBrokerCandles(
  provider: BrokerProvider,
  providerAccountId: string,
  symbol: string,
  timeframe: '1m' | '5m' | '15m' | '1h',
  limit: number,
): Promise<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>> {
  if (provider === 'fxapis') return getFxApisCandles(providerAccountId, symbol, timeframe, limit);
  return fetchCandles(providerAccountId, symbol, timeframe, limit);
}

function mapFxApiOrder(order: Awaited<ReturnType<typeof placeFxApisMarketOrder>>): BrokerOrderResult {
  if (order.state === 'filled' || order.state === 'partially_filled' || order.state === 'completed') {
    if (!order.brokerPositionId || order.filledPrice === null || order.filledVolume === null) {
      return {
        ticket: order.brokerPositionId,
        providerOrderId: order.id,
        price: order.filledPrice ?? 0,
        volume: order.filledVolume ?? 0,
        status: 'unknown',
        message: order.stateDetail ?? 'FXAPIs has not confirmed the broker position ticket yet.',
      };
    }
    return {
      ticket: order.brokerPositionId,
      providerOrderId: order.id,
      price: order.filledPrice ?? 0,
      volume: order.filledVolume ?? 0,
      status: 'accepted',
      message: order.stateDetail ?? undefined,
    };
  }
  if (order.state === 'rejected' || order.state === 'failed') {
    return {
      ticket: order.brokerPositionId,
      providerOrderId: order.id,
      price: 0,
      volume: 0,
      status: 'rejected',
      message: order.stateDetail ?? 'The broker rejected the order.',
    };
  }
  return {
    ticket: null,
    providerOrderId: order.id,
    price: 0,
    volume: order.filledVolume ?? 0,
    status: 'unknown',
    message: order.stateDetail ?? 'FXAPIs is still confirming the order.',
  };
}

function mapFxApiOrderError(error: unknown): BrokerOrderResult | null {
  if (!(error instanceof FxApisError)) return null;
  const details = Array.isArray(error.details)
    ? error.details.find((detail): detail is Record<string, unknown> =>
      typeof detail === 'object' && detail !== null && !Array.isArray(detail))
    : undefined;
  const providerOrderId = typeof details?.orderId === 'string' ? details.orderId : null;
  if (error.code === 'IDEMPOTENCY_IN_FLIGHT') {
    return {
      ticket: null, providerOrderId, price: 0, volume: 0,
      status: 'unknown', message: error.message,
    };
  }
  if (error.status >= 400 && error.status < 500) {
    return {
      ticket: null, providerOrderId, price: 0, volume: 0,
      status: 'rejected', message: error.message,
    };
  }
  return null;
}

export async function submitBrokerMarketOrder(
  provider: BrokerProvider,
  providerAccountId: string,
  request: BrokerOrderRequest,
  idempotencyKey: string,
): Promise<BrokerOrderResult> {
  if (provider === 'fxapis') {
    try {
      const result = mapFxApiOrder(await placeFxApisMarketOrder({
        accountId: providerAccountId,
        symbol: request.symbol,
        side: request.side,
        volume: request.volume,
        comment: request.comment,
        clientOrderId: request.clientId,
        idempotencyKey,
      }));
      return result.status === 'accepted' && result.volume <= 0
        ? { ...result, volume: request.volume }
        : result;
    } catch (error) {
      const mapped = mapFxApiOrderError(error);
      if (mapped) return mapped;
      throw error;
    }
  }
  const result = await submitMarketOrder(providerAccountId, request);
  return {
    ticket: result.ticket || null,
    providerOrderId: null,
    price: result.price,
    volume: result.volume,
    status: result.status,
    message: result.message,
  };
}

export async function closeBrokerPosition(
  provider: BrokerProvider,
  providerAccountId: string,
  args: { ticket: string; symbol: string; side: 'buy' | 'sell'; volume: number; clientId: string; idempotencyKey: string },
): Promise<BrokerOrderResult> {
  if (provider === 'fxapis') {
    try {
      const result = mapFxApiOrder(await closeFxApisPosition({
        accountId: providerAccountId,
        positionId: args.ticket,
        volume: args.volume,
        comment: `close:${args.clientId}`,
        clientOrderId: args.clientId,
        idempotencyKey: args.idempotencyKey,
      }));
      if (result.status === 'accepted') {
        return { ...result, ticket: result.ticket ?? args.ticket, volume: result.volume || args.volume };
      }
      return result;
    } catch (error) {
      const mapped = mapFxApiOrderError(error);
      if (mapped) return mapped;
      throw error;
    }
  }
  const result = await submitMarketOrder(providerAccountId, {
    symbol: args.symbol,
    side: args.side === 'buy' ? 'sell' : 'buy',
    volume: args.volume,
    comment: `close:${args.clientId}`,
    clientId: args.clientId,
  });
  return {
    ticket: result.ticket || null,
    providerOrderId: null,
    price: result.price,
    volume: result.volume,
    status: result.status,
    message: result.message,
  };
}

export async function resolveFxApisOrder(accountId: string, orderId: string): Promise<BrokerOrderResult> {
  const result = mapFxApiOrder(await getFxApisOrder(orderId));
  if (result.status !== 'unknown' || !result.ticket) return result;
  const position = (await getFxApisPositions(accountId)).find(({ id }) => id === result.ticket);
  if (!position) return result;
  return {
    ...result,
    ticket: position.id,
    price: position.openPrice,
    volume: position.volume,
    status: 'accepted',
  };
}

export async function disconnectBrokerAccount(provider: BrokerProvider, providerAccountId: string): Promise<void> {
  if (provider === 'fxapis') await disconnectFxApisAccount(providerAccountId);
}
