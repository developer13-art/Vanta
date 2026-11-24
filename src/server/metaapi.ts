import MetaApi from 'metaapi.cloud-sdk/esm-node';
import { env } from './env';
import { logger } from './logger';

// Single cached SDK instance for the entire process lifetime.
// Do NOT create per-request instances — the SDK will rate-limit / leak memory.
let cachedClient: MetaApi | null = null;

export function getMetaApiClient(): MetaApi {
  if (cachedClient) return cachedClient;
  cachedClient = new MetaApi(env.METAAPI_TOKEN, {
    application: 'VantaTradeAI/1.0',
  });
  logger.info('MetaApi client initialised (single instance)');
  return cachedClient;
}

export interface ProvisionRequest {
  login: string;
  password: string;
  server: string;
  name: string;
  platform: 'mt4' | 'mt5';
}

export async function provisionAccount(req: ProvisionRequest): Promise<string> {
  const api = getMetaApiClient();
  const account = await api.metatraderAccountApi.createAccount({
    login: req.login,
    password: req.password,
    name: req.name,
    server: req.server,
    platform: req.platform,
    type: 'cloud-g2',
    magic: 0,
    reliability: 'regular',
  });
  await account.deploy();
  return account.id;
}

export async function fetchAccountInformation(metaapiAccountId: string): Promise<{
  balance: number;
  equity: number;
  freeMargin: number;
  usedMargin: number;
  marginLevel: number | null;
  currency: string;
  leverage: number;
  isHedging: boolean;
}> {
  const api = getMetaApiClient();
  const account = await api.metatraderAccountApi.getAccount(metaapiAccountId);
  const connection = account.getRPCConnection();
  await connection.connect();
  try {
    const info = await connection.getAccountInformation();
    return {
      balance: info.balance,
      equity: info.equity,
      freeMargin: info.freeMargin,
      usedMargin: info.margin,
      marginLevel: info.marginLevel ?? null,
      currency: info.currency,
      leverage: info.leverage,
      isHedging: info.type === 'HEDGING' || info.marginMode === 'HEDGING',
    };
  } finally {
    await connection.close();
  }
}

export async function fetchSymbols(metaapiAccountId: string): Promise<Array<{
  symbol: string;
  description: string | null;
  digits: number;
  tickSize: number;
  contractSize: number;
  minVolume: number;
  maxVolume: number;
  volumeStep: number;
}>> {
  const api = getMetaApiClient();
  const account = await api.metatraderAccountApi.getAccount(metaapiAccountId);
  const connection = account.getRPCConnection();
  await connection.connect();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const specs: any[] = await connection.getSymbolSpecifications();
    return specs.map((s) => ({
      symbol: s.symbol,
      description: s.description ?? null,
      digits: s.digits,
      tickSize: s.tickSize,
      contractSize: s.contractSize,
      minVolume: s.minVolume,
      maxVolume: s.maxVolume,
      volumeStep: s.volumeStep,
    }));
  } finally {
    await connection.close();
  }
}

export interface BrokerOrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  comment?: string;
  clientId?: string;
}

export interface BrokerOrderResult {
  ticket: string;
  price: number;
  volume: number;
  status: 'accepted' | 'rejected' | 'unknown';
  message?: string;
}

export async function submitMarketOrder(
  metaapiAccountId: string,
  req: BrokerOrderRequest,
): Promise<BrokerOrderResult> {
  const api = getMetaApiClient();
  const account = await api.metatraderAccountApi.getAccount(metaapiAccountId);
  const connection = account.getRPCConnection();
  await connection.connect();
  try {
    const result = await connection.createMarketBuyOrder(req.symbol, req.volume, undefined, undefined, {
      comment: req.comment,
      clientId: req.clientId,
    }).catch(async (err: unknown) => {
      if (req.side === 'buy') throw err;
      return connection.createMarketSellOrder(req.symbol, req.volume, undefined, undefined, {
        comment: req.comment,
        clientId: req.clientId,
      });
    });
    return {
      ticket: String(result.orderId ?? result.positionId ?? ''),
      price: result.price ?? 0,
      volume: result.volume ?? req.volume,
      status: 'accepted',
      message: result.message,
    };
  } finally {
    await connection.close();
  }
}

export async function fetchOpenPositions(metaapiAccountId: string) {
  const api = getMetaApiClient();
  const account = await api.metatraderAccountApi.getAccount(metaapiAccountId);
  const connection = account.getRPCConnection();
  await connection.connect();
  try {
    return await connection.getPositions();
  } finally {
    await connection.close();
  }
}

export async function fetchPrices(metaapiAccountId: string, symbols: string[]) {
  const api = getMetaApiClient();
  const account = await api.metatraderAccountApi.getAccount(metaapiAccountId);
  const connection = account.getRPCConnection();
  await connection.connect();
  try {
    await connection.waitSynchronized();
    return await Promise.all(symbols.map((symbol) => connection.getSymbolPrice(symbol, true)));
  } finally {
    await connection.close();
  }
}

export async function fetchCandles(
  metaapiAccountId: string,
  symbol: string,
  timeframe: '1m' | '5m' | '15m' | '1h',
  limit = 100,
) {
  const api = getMetaApiClient();
  const account = await api.metatraderAccountApi.getAccount(metaapiAccountId);
  const candles = await account.getHistoricalCandles(symbol, timeframe, undefined, limit);
  return candles.map((candle) => ({
    time: Math.floor(candle.time.getTime() / 1000),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.tickVolume,
  }));
}