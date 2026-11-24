import { env } from './env';
import { Errors } from './errors';
import { logger } from './logger';

export const PAYMENT_CURRENCIES = ['USD', 'NGN', 'GBP', 'EUR', 'JPY', 'MXN', 'GHS', 'KES', 'UGX', 'TZS', 'RWF', 'ZAR'] as const;
export type PaymentCurrency = typeof PAYMENT_CURRENCIES[number];

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'UGX', 'RWF']);
const THREE_DECIMAL_CURRENCIES = new Set(['KWD', 'BHD', 'JOD', 'OMR', 'TND']);

interface ExchangeRates {
  rates: Record<string, number>;
  updatedAt: string;
  nextUpdate: number;
}

let cachedRates: ExchangeRates | null = null;

export function currencyDecimals(currency: string): number {
  const normalized = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(normalized)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(normalized)) return 3;
  return 2;
}

export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * (10 ** currencyDecimals(currency)));
}

export async function exchangeRates(): Promise<ExchangeRates> {
  if (cachedRates && cachedRates.nextUpdate > Date.now() / 1000) return cachedRates;

  let response: Response;
  try {
    response = await fetch(env.PAYMENT_FX_API_URL, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    logger.error({ error }, 'Payment exchange-rate request failed');
    throw Errors.unavailable('Exchange rates are temporarily unavailable. Please try again.');
  }
  if (!response.ok) {
    logger.error({ status: response.status }, 'Payment exchange-rate provider rejected the request');
    throw Errors.unavailable('Exchange rates are temporarily unavailable. Please try again.');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    logger.error({ error }, 'Payment exchange-rate provider returned invalid JSON');
    throw Errors.unavailable('Exchange rates are temporarily unavailable. Please try again.');
  }
  if (typeof payload !== 'object' || payload === null || !('result' in payload) || payload.result !== 'success'
    || !('base_code' in payload) || payload.base_code !== 'USD'
    || !('rates' in payload) || typeof payload.rates !== 'object' || payload.rates === null
    || !('time_last_update_unix' in payload) || typeof payload.time_last_update_unix !== 'number'
    || !('time_next_update_unix' in payload) || typeof payload.time_next_update_unix !== 'number') {
    logger.error('Payment exchange-rate provider returned an invalid response');
    throw Errors.unavailable('Exchange rates are temporarily unavailable. Please try again.');
  }

  const rates: Record<string, number> = {};
  for (const [currency, rate] of Object.entries(payload.rates)) {
    if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) rates[currency] = rate;
  }
  const now = Date.now() / 1000;
  if (payload.time_last_update_unix > now || payload.time_next_update_unix <= now
    || !PAYMENT_CURRENCIES.every((currency) => typeof rates[currency] === 'number')) {
    logger.error('Payment exchange-rate provider returned incomplete or expired rates');
    throw Errors.unavailable('Exchange rates are temporarily unavailable. Please try again.');
  }

  cachedRates = {
    rates,
    updatedAt: new Date(payload.time_last_update_unix * 1000).toISOString(),
    nextUpdate: payload.time_next_update_unix,
  };
  return cachedRates;
}

export async function quoteUsdAmount(amountUsd: number, currency: PaymentCurrency): Promise<{
  amount: number;
  rate: number;
  updatedAt: string;
}> {
  const quotes = await exchangeRates();
  const rate = quotes.rates[currency];
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw Errors.unavailable('The selected currency is not currently supported.');
  }
  const decimals = currencyDecimals(currency);
  const amount = Math.round(amountUsd * rate * (10 ** decimals)) / (10 ** decimals);
  return { amount, rate, updatedAt: quotes.updatedAt };
}
