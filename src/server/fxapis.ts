import { env } from './env';
import { logger } from './logger';

type JsonRecord = Record<string, unknown>;

export class FxApisError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'FxApisError';
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numericValue(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function requestEnvelope(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: JsonRecord; idempotencyKey?: string } = {},
): Promise<JsonRecord> {
  if (!env.FXAPIS_API_KEY) {
    throw new FxApisError('FXAPIs is not configured on this server.', 503, 'NOT_CONFIGURED');
  }

  let response: Response;
  try {
    response = await fetch(`${env.FXAPIS_API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${env.FXAPIS_API_KEY}`,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new FxApisError('Could not reach FXAPIs.', 503, 'NETWORK_ERROR');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new FxApisError('FXAPIs returned an invalid response.', 502, 'INVALID_RESPONSE');
  }

  const envelope = isRecord(payload) ? payload : null;
  if (!response.ok) {
    const error = envelope && isRecord(envelope.error) ? envelope.error : null;
    throw new FxApisError(
      typeof error?.message === 'string' ? error.message : 'FXAPIs rejected the request.',
      response.status,
      typeof error?.code === 'string' ? error.code : 'PROVIDER_ERROR',
      error?.details,
    );
  }
  if (!envelope || !('data' in envelope)) {
    throw new FxApisError('FXAPIs returned an invalid response.', 502, 'INVALID_RESPONSE');
  }
  return envelope;
}

async function requestData(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: JsonRecord; idempotencyKey?: string } = {},
): Promise<unknown> {
  return (await requestEnvelope(path, options)).data;
}

function requireRecord(value: unknown, message = 'FXAPIs returned incomplete account data.'): JsonRecord {
  if (!isRecord(value)) throw new FxApisError(message, 502, 'INVALID_RESPONSE');
  return value;
}

export async function connectAccount(args: {
  login: string;
  password: string;
  server: string;
  label: string;
}): Promise<string> {
  const data = requireRecord(await requestData('/v1/accounts', {
    method: 'POST',
    body: {
      platform: 'mt5',
      login: args.login,
      password: args.password,
      server: args.server,
      label: args.label,
      mode: env.FXAPIS_ACCOUNT_MODE,
    },
  }));
  if (typeof data.id !== 'string' || data.id.length === 0) {
    throw new FxApisError('FXAPIs did not return an account ID.', 502, 'INVALID_RESPONSE');
  }
  try {
    await requestWarm(data.id);
  } catch (error) {
    try {
      await disconnectAccount(data.id);
    } catch (cleanupError) {
      logger.error({ cleanupError, accountId: data.id }, 'FXAPIs account cleanup failed after warm request');
    }
    throw error;
  }
  return data.id;
}

export async function disconnectAccount(accountId: string): Promise<void> {
  await requestData(`/v1/accounts/${encodeURIComponent(accountId)}/disconnect`, { method: 'POST', body: {} });
}

export async function getAccountState(accountId: string): Promise<{ state: string; detail: string | null }> {
  const data = requireRecord(await requestData(`/v1/accounts/${encodeURIComponent(accountId)}/status`));
  if (typeof data.state !== 'string') throw new FxApisError('FXAPIs returned incomplete account status.', 502, 'INVALID_RESPONSE');
  return { state: data.state, detail: typeof data.detail === 'string' ? data.detail : null };
}

async function requestWarm(accountId: string): Promise<void> {
  const path = `/v1/accounts/${encodeURIComponent(accountId)}/warm`;
  const request = () => requestData(path, { method: 'POST', body: {} });
  try {
    await request();
  } catch (error) {
    if (!(error instanceof FxApisError) || error.status !== 503 || error.code !== 'SCHEDULER_FAILED') throw error;
    logger.warn({ accountId, code: error.code }, 'FXAPIs warm request failed temporarily; retrying once');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await request();
  }
}

const ONLINE_ACCOUNT_STATES = new Set(['ready', 'executing', 'degraded']);
const ATTENTION_ACCOUNT_STATES = new Set([
  'invalid_credentials', 'trading_disabled', 'needs_2fa', 'needs_certificate',
]);
const WARMABLE_ACCOUNT_STATES = new Set(['created', 'standby', 'offline', 'error']);
const accountWarmups = new Map<string, Promise<void>>();

async function bringAccountOnline(accountId: string): Promise<void> {
  let accountState = await getAccountState(accountId);
  if (ONLINE_ACCOUNT_STATES.has(accountState.state)) return;
  if (ATTENTION_ACCOUNT_STATES.has(accountState.state)) {
    throw new FxApisError(
      accountState.detail ?? `FXAPIs account needs attention (${accountState.state}).`,
      409,
      'ACCOUNT_NEEDS_ATTENTION',
    );
  }

  let warmRequested = false;
  if (WARMABLE_ACCOUNT_STATES.has(accountState.state)) {
    await requestWarm(accountId);
    warmRequested = true;
  }

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    accountState = await getAccountState(accountId);
    if (ONLINE_ACCOUNT_STATES.has(accountState.state)) return;
    if (ATTENTION_ACCOUNT_STATES.has(accountState.state)) {
      throw new FxApisError(
        accountState.detail ?? `FXAPIs account needs attention (${accountState.state}).`,
        409,
        'ACCOUNT_NEEDS_ATTENTION',
      );
    }
    if (!warmRequested && WARMABLE_ACCOUNT_STATES.has(accountState.state)) {
      await requestWarm(accountId);
      warmRequested = true;
    }
  }
  throw new FxApisError('FXAPIs account did not come online in time. Try again shortly.', 503, 'ACCOUNT_WARM_TIMEOUT');
}

export async function ensureAccountOnline(accountId: string): Promise<void> {
  const currentWarmup = accountWarmups.get(accountId);
  if (currentWarmup) return currentWarmup;

  const warmup = bringAccountOnline(accountId);
  accountWarmups.set(accountId, warmup);
  try {
    await warmup;
  } finally {
    if (accountWarmups.get(accountId) === warmup) accountWarmups.delete(accountId);
  }
}

export async function getAccountFigures(accountId: string): Promise<{
  balance: number | null;
  equity: number | null;
  freeMargin: number | null;
  usedMargin: number | null;
  marginLevel: number | null;
  currency: string | null;
  leverage: number | null;
  isHedging: boolean | null;
}> {
  const data = requireRecord(await requestData(`/v1/accounts/${encodeURIComponent(accountId)}/figures`));
  return {
    balance: numericValue(data.balance),
    equity: numericValue(data.equity),
    freeMargin: numericValue(data.freeMargin),
    usedMargin: numericValue(data.margin),
    marginLevel: numericValue(data.marginLevel),
    currency: typeof data.currency === 'string' ? data.currency : null,
    leverage: numericValue(data.leverage),
    isHedging: data.marginMode === 'hedging' ? true : data.marginMode === 'netting' ? false : null,
  };
}

export async function getSymbols(accountId: string): Promise<Array<{
  symbol: string;
  description: string | null;
  digits: number | null;
  contractSize: number | null;
  minVolume: number | null;
  maxVolume: number | null;
  volumeStep: number | null;
  tradable: boolean;
}>> {
  const data = await requestData(`/v1/accounts/${encodeURIComponent(accountId)}/symbols?limit=1000`);
  if (!Array.isArray(data)) throw new FxApisError('FXAPIs returned an invalid symbol list.', 502, 'INVALID_RESPONSE');
  return data.map((item) => {
    const row = requireRecord(item, 'FXAPIs returned an invalid symbol.');
    if (typeof row.name !== 'string' || row.name.length === 0) {
      throw new FxApisError('FXAPIs returned a symbol without a name.', 502, 'INVALID_RESPONSE');
    }
    return {
      symbol: row.name,
      description: typeof row.description === 'string' ? row.description : null,
      digits: numericValue(row.digits),
      contractSize: numericValue(row.contractSize),
      minVolume: numericValue(row.volumeMin),
      maxVolume: numericValue(row.volumeMax),
      volumeStep: numericValue(row.volumeStep),
      tradable: row.tradable === true,
    };
  });
}

export async function getQuotes(accountId: string, symbols: string[]): Promise<Array<{
  symbol: string;
  status: 'ok' | 'no_price' | 'unknown_symbol';
  bid: number | null;
  ask: number | null;
  spreadPoints: number | null;
  time: string | null;
  stale: boolean;
  marketOpen: boolean | null;
  tradeMode: 'full' | 'longOnly' | 'shortOnly' | 'closeOnly' | 'disabled' | null;
}>> {
  if (symbols.length === 0 || symbols.length > 20) {
    throw new FxApisError('FXAPIs quote requests require between 1 and 20 symbols.', 400, 'INVALID_REQUEST');
  }
  const params = new URLSearchParams({ symbols: symbols.join(',') });
  const data = await requestData(`/v1/accounts/${encodeURIComponent(accountId)}/quotes?${params}`);
  if (!Array.isArray(data)) throw new FxApisError('FXAPIs returned an invalid quote list.', 502, 'INVALID_RESPONSE');
  return data.map((item) => {
    const row = requireRecord(item, 'FXAPIs returned an invalid quote.');
    const status = row.status;
    const tradeMode = row.tradeMode;
    if (typeof row.symbol !== 'string'
      || (status !== 'ok' && status !== 'no_price' && status !== 'unknown_symbol')
      || typeof row.stale !== 'boolean'
      || (tradeMode !== null && tradeMode !== undefined
        && tradeMode !== ''
        && tradeMode !== 'full' && tradeMode !== 'longOnly' && tradeMode !== 'shortOnly'
        && tradeMode !== 'closeOnly' && tradeMode !== 'disabled')) {
      throw new FxApisError('FXAPIs returned an incomplete quote.', 502, 'INVALID_RESPONSE');
    }
    return {
      symbol: row.symbol,
      status,
      bid: numericValue(row.bid),
      ask: numericValue(row.ask),
      spreadPoints: numericValue(row.spread),
      time: typeof row.time === 'string' ? row.time : null,
      stale: row.stale,
      marketOpen: typeof row.marketOpen === 'boolean' ? row.marketOpen : null,
      tradeMode: typeof tradeMode === 'string' && tradeMode !== '' ? tradeMode : null,
    };
  });
}

export async function getOpenPositions(accountId: string): Promise<Array<{
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  currentPrice: number | null;
  profit: number | null;
  commission: number | null;
  swap: number | null;
}>> {
  const data = await requestData(`/v1/accounts/${encodeURIComponent(accountId)}/positions`);
  if (!Array.isArray(data)) throw new FxApisError('FXAPIs returned an invalid positions list.', 502, 'INVALID_RESPONSE');
  return data.map((item) => {
    const row = requireRecord(item, 'FXAPIs returned an invalid position.');
    const volume = numericValue(row.volume);
    const openPrice = numericValue(row.openPrice);
    if (typeof row.brokerPositionId !== 'string' || typeof row.symbol !== 'string'
      || (row.side !== 'buy' && row.side !== 'sell') || volume === null || openPrice === null) {
      throw new FxApisError('FXAPIs returned an incomplete position.', 502, 'INVALID_RESPONSE');
    }
    return {
      id: row.brokerPositionId,
      symbol: row.symbol,
      side: row.side,
      volume,
      openPrice,
      currentPrice: numericValue(row.currentPrice),
      profit: numericValue(row.profit),
      commission: numericValue(row.commission),
      swap: numericValue(row.swap),
    };
  });
}

export interface FxApiDeal {
  brokerDealId: string;
  brokerPositionId: string | null;
  symbol: string | null;
  dealType: string;
  entry: string | null;
  volume: number | null;
  price: number | null;
  profit: number | null;
  commission: number | null;
  swap: number | null;
  fee: number | null;
  dealtAt: string;
}

export async function getAccountDeals(accountId: string, cursor?: string): Promise<{
  deals: FxApiDeal[];
  hasMore: boolean;
  nextCursor: string | null;
}> {
  const params = new URLSearchParams({ limit: '100' });
  if (cursor) params.set('cursor', cursor);
  const envelope = await requestEnvelope(
    `/v1/accounts/${encodeURIComponent(accountId)}/deals?${params.toString()}`,
  );
  if (!Array.isArray(envelope.data)) {
    throw new FxApisError('FXAPIs returned an invalid deal history.', 502, 'INVALID_RESPONSE');
  }
  const page = requireRecord(envelope.page, 'FXAPIs returned invalid deal pagination data.');
  if (typeof page.hasMore !== 'boolean'
    || (page.hasMore && (typeof page.nextCursor !== 'string' || page.nextCursor.length === 0))) {
    throw new FxApisError('FXAPIs returned invalid deal pagination data.', 502, 'INVALID_RESPONSE');
  }
  const deals = envelope.data.map((item) => {
    const row = requireRecord(item, 'FXAPIs returned an invalid deal.');
    if (typeof row.brokerDealId !== 'string' || typeof row.dealType !== 'string'
      || typeof row.dealtAt !== 'string') {
      throw new FxApisError('FXAPIs returned an incomplete deal.', 502, 'INVALID_RESPONSE');
    }
    return {
      brokerDealId: row.brokerDealId,
      brokerPositionId: typeof row.brokerPositionId === 'string' ? row.brokerPositionId : null,
      symbol: typeof row.symbol === 'string' ? row.symbol : null,
      dealType: row.dealType,
      entry: typeof row.entry === 'string' ? row.entry : null,
      volume: numericValue(row.volume),
      price: numericValue(row.price),
      profit: numericValue(row.profit),
      commission: numericValue(row.commission),
      swap: numericValue(row.swap),
      fee: numericValue(row.fee),
      dealtAt: row.dealtAt,
    };
  });
  return {
    deals,
    hasMore: page.hasMore,
    nextCursor: typeof page.nextCursor === 'string' && page.nextCursor.length > 0
      ? page.nextCursor
      : null,
  };
}

export async function getCandles(
  accountId: string,
  symbol: string,
  timeframe: '1m' | '5m' | '15m' | '1h',
  count: number,
): Promise<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>> {
  await ensureAccountOnline(accountId);
  const timeframes = { '1m': 'M1', '5m': 'M5', '15m': 'M15', '1h': 'H1' } as const;
  const params = new URLSearchParams({ symbol, timeframe: timeframes[timeframe], count: String(count) });
  const data = requireRecord(await requestData(`/v1/accounts/${encodeURIComponent(accountId)}/candles?${params}`));
  if (!Array.isArray(data.candles)) throw new FxApisError('FXAPIs returned an invalid candle list.', 502, 'INVALID_RESPONSE');
  return data.candles.map((item) => {
    const row = requireRecord(item, 'FXAPIs returned an invalid candle.');
    const time = typeof row.time === 'string' ? Date.parse(row.time) : Number.NaN;
    const open = numericValue(row.open);
    const high = numericValue(row.high);
    const low = numericValue(row.low);
    const close = numericValue(row.close);
    const volume = numericValue(row.tickVolume);
    if (!Number.isFinite(time) || open === null || high === null || low === null || close === null || volume === null) {
      throw new FxApisError('FXAPIs returned an incomplete candle.', 502, 'INVALID_RESPONSE');
    }
    return { time: Math.floor(time / 1000), open, high, low, close, volume };
  });
}

export interface FxApiOrder {
  id: string | null;
  state: string;
  stateDetail: string | null;
  brokerPositionId: string | null;
  brokerOrderId: string | null;
  filledPrice: number | null;
  filledVolume: number | null;
}

function mapOrder(value: unknown): FxApiOrder {
  const data = requireRecord(value, 'FXAPIs returned an invalid order.');
  if (typeof data.state !== 'string') throw new FxApisError('FXAPIs returned an order without a state.', 502, 'INVALID_RESPONSE');
  return {
    id: typeof data.id === 'string' ? data.id : null,
    state: data.state,
    stateDetail: typeof data.stateDetail === 'string' ? data.stateDetail : null,
    brokerPositionId: typeof data.brokerPositionId === 'string' ? data.brokerPositionId : null,
    brokerOrderId: typeof data.brokerOrderId === 'string' ? data.brokerOrderId : null,
    filledPrice: numericValue(data.filledPrice),
    filledVolume: numericValue(data.filledVolume ?? data.volume),
  };
}

function unresolvedOrderId(error: FxApisError): string | null {
  if (!Array.isArray(error.details)) return null;
  for (const item of error.details) {
    if (isRecord(item) && typeof item.orderId === 'string') return item.orderId;
  }
  return null;
}

export async function placeMarketOrder(args: {
  accountId: string;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  comment: string;
  clientOrderId: string;
  idempotencyKey: string;
}): Promise<FxApiOrder> {
  const body = {
    symbol: args.symbol,
    side: args.side,
    volume: args.volume.toFixed(4),
    comment: args.comment,
    clientOrderId: args.clientOrderId,
  };
  try {
    return mapOrder(await requestData(`/v1/accounts/${encodeURIComponent(args.accountId)}/orders/market`, {
      method: 'POST',
      body,
      idempotencyKey: args.idempotencyKey,
    }));
  } catch (error) {
    if (!(error instanceof FxApisError)) throw error;
    if (error.code === 'ORDER_UNRESOLVED') {
      return {
        id: unresolvedOrderId(error),
        state: 'unknown',
        stateDetail: error.message,
        brokerPositionId: null,
        brokerOrderId: null,
        filledPrice: null,
        filledVolume: null,
      };
    }
    if (error.code === 'ORDER_REJECTED' || error.code === 'NO_PRICE' || error.code === 'SEND_FAILED') {
      return {
        id: unresolvedOrderId(error),
        state: 'rejected',
        stateDetail: error.message,
        brokerPositionId: null,
        brokerOrderId: null,
        filledPrice: null,
        filledVolume: null,
      };
    }
    throw error;
  }
}

export async function closePosition(args: {
  accountId: string;
  positionId: string;
  volume: number;
  comment: string;
  clientOrderId: string;
  idempotencyKey: string;
}): Promise<FxApiOrder> {
  const body = {
    volume: args.volume.toFixed(4),
    comment: args.comment,
    clientOrderId: args.clientOrderId,
  };
  try {
    return mapOrder(await requestData(
      `/v1/accounts/${encodeURIComponent(args.accountId)}/positions/${encodeURIComponent(args.positionId)}/close`,
      { method: 'POST', body, idempotencyKey: args.idempotencyKey },
    ));
  } catch (error) {
    if (!(error instanceof FxApisError)) throw error;
    if (error.code === 'ORDER_UNRESOLVED') {
      return {
        id: unresolvedOrderId(error),
        state: 'unknown',
        stateDetail: error.message,
        brokerPositionId: args.positionId,
        brokerOrderId: null,
        filledPrice: null,
        filledVolume: null,
      };
    }
    if (error.code === 'ORDER_REJECTED' || error.code === 'NO_PRICE' || error.code === 'SEND_FAILED') {
      return {
        id: unresolvedOrderId(error),
        state: 'rejected',
        stateDetail: error.message,
        brokerPositionId: args.positionId,
        brokerOrderId: null,
        filledPrice: null,
        filledVolume: null,
      };
    }
    throw error;
  }
}

export async function getOrder(orderId: string): Promise<FxApiOrder> {
  return mapOrder(await requestData(`/v1/orders/${encodeURIComponent(orderId)}`));
}
