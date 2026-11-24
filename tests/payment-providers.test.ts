import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

const state = vi.hoisted(() => ({
  env: {
    APP_BASE_URL: 'https://vanta.test',
    CREDENTIALS_ENC_KEY_BASE64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    PAYSTACK_SECRET_KEY: 'paystack-secret',
    PAYSTACK_PUBLIC_KEY: 'paystack-public',
    PAYSTACK_BASE_URL: 'https://paystack.test',
    PAYSTACK_CURRENCY: 'NGN',
    FLUTTERWAVE_SECRET_KEY: 'flutterwave-secret',
    FLUTTERWAVE_WEBHOOK_SECRET_HASH: 'flutterwave-hash',
    FLUTTERWAVE_CURRENCIES: 'NGN,USD',
    STRIPE_SECRET_KEY: 'sk_test_secret',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
    STRIPE_BANK_TRANSFER_CURRENCIES: 'USD',
  },
  fetch: vi.fn(),
  query: vi.fn(),
  withTransaction: vi.fn(),
  applyLedgerInTransaction: vi.fn(),
}));

vi.mock('../src/server/env', () => ({ env: state.env }));
vi.mock('../src/server/db', () => ({ query: state.query, withTransaction: state.withTransaction }));
vi.mock('../src/server/ledger', () => ({ applyLedgerInTransaction: state.applyLedgerInTransaction }));
vi.mock('../src/server/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('../src/server/payment-fx', () => ({
  PAYMENT_CURRENCIES: ['USD', 'NGN', 'GBP', 'EUR', 'JPY', 'MXN', 'GHS', 'KES', 'UGX', 'TZS', 'RWF', 'ZAR'],
  currencyDecimals: (currency: string) => currency.toUpperCase() === 'JPY' ? 0 : 2,
  exchangeRates: vi.fn().mockResolvedValue({
    rates: { USD: 1, NGN: 1500, GBP: 0.8, EUR: 0.9, JPY: 150, MXN: 18, GHS: 12, KES: 130, UGX: 3800, TZS: 2500, RWF: 1300, ZAR: 18 },
    updatedAt: new Date().toISOString(),
    nextUpdate: Date.now() / 1000 + 3600,
  }),
  quoteUsdAmount: vi.fn(async (amount: number, currency: string) => ({
    amount: amount * (currency === 'NGN' ? 1500 : 1),
    rate: currency === 'NGN' ? 1500 : 1,
    updatedAt: new Date().toISOString(),
  })),
  toMinorUnits: (amount: number, currency: string) => Math.round(amount * (currency.toUpperCase() === 'JPY' ? 1 : 100)),
}));

import { applyLedgerInTransaction } from '../src/server/ledger';
import { query, withTransaction } from '../src/server/db';
import {
  getPaymentOptions,
  startPayment,
  verifyFlutterwaveWebhook,
  verifyPaymentForUser,
  verifyStripeWebhook,
} from '../src/server/payments';

function dbResult<T>(rows: T[]) {
  return { command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows };
}

describe('payment provider integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', state.fetch);
    state.query.mockResolvedValue(dbResult([]));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('only offers providers enabled for each configured currency', async () => {
    const options = await getPaymentOptions();
    expect(options.currencies.find(({ code }) => code === 'NGN')?.methods).toEqual(expect.arrayContaining([
      { provider: 'paystack', method: 'card', label: 'Paystack' },
      { provider: 'flutterwave', method: 'card', label: 'Flutterwave' },
    ]));
    expect(options.currencies.find(({ code }) => code === 'USD')?.methods).toEqual(expect.arrayContaining([
      { provider: 'flutterwave', method: 'card', label: 'Flutterwave' },
      { provider: 'stripe', method: 'card', label: 'Stripe' },
      { provider: 'stripe', method: 'bank_transfer', label: 'Bank transfer' },
    ]));
  });

  it('initializes Flutterwave checkout with the selected currency and internal reference', async () => {
    state.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: { link: 'https://checkout.flutterwave.test', id: 912345 } }),
    });

    const result = await startPayment({
      userId: 'user-12345678',
      email: 'trader@example.com',
      packageCode: 'starter',
      provider: 'flutterwave',
      method: 'card',
      currency: 'USD',
    });

    const [, init] = state.fetch.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(result.authorizationUrl).toBe('https://checkout.flutterwave.test');
    expect(payload).toMatchObject({ currency: 'USD', amount: 8, tx_ref: result.reference });
    expect(state.query.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(['flutterwave', result.reference]));
  });

  it('configures Stripe bank transfers through Checkout and associates a customer', async () => {
    state.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'cus_test_123' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'cs_test_123', url: 'https://checkout.stripe.test' }) });

    const result = await startPayment({
      userId: 'user-12345678',
      email: 'trader@example.com',
      packageCode: 'starter',
      provider: 'stripe',
      method: 'bank_transfer',
      currency: 'USD',
    });

    const [, sessionInit] = state.fetch.mock.calls[1] as [string, RequestInit];
    const form = new URLSearchParams(String(sessionInit.body));
    expect(result.authorizationUrl).toBe('https://checkout.stripe.test');
    expect(form.get('customer')).toBe('cus_test_123');
    expect(form.get('payment_method_types[0]')).toBe('customer_balance');
    expect(form.get('payment_method_options[customer_balance][funding_type]')).toBe('bank_transfer');
    expect(form.get('payment_method_options[customer_balance][bank_transfer][type]')).toBe('us_bank_transfer');
  });

  it('verifies Flutterwave transactions with the provider before granting credits', async () => {
    const payment = {
      id: 'payment-1',
      user_id: 'user-1',
      provider: 'flutterwave' as const,
      provider_reference: 'vanta-ref-1',
      provider_transaction_id: null,
      credits_granted: 100,
      package_code: 'starter',
      amount: '8.00',
      currency: 'USD',
      status: 'pending',
    };
    vi.mocked(query).mockResolvedValueOnce(dbResult([payment]));
    const transactionQuery = vi.fn()
      .mockResolvedValueOnce(dbResult([payment]))
      .mockResolvedValue(dbResult([]));
    vi.mocked(withTransaction).mockImplementation(async (callback) => callback({ query: transactionQuery } as never));
    vi.mocked(applyLedgerInTransaction).mockResolvedValue(100);
    state.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        data: { tx_ref: 'vanta-ref-1', status: 'successful', amount: 8, currency: 'USD' },
      }),
    });

    await expect(verifyPaymentForUser('vanta-ref-1', 'user-1', '123456'))
      .resolves.toEqual({ status: 'successful', creditsGranted: 100 });
    expect(applyLedgerInTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: 'purchase',
      reason: 'flutterwave:vanta-ref-1',
      idempotencyKey: 'purchase:vanta-ref-1',
    }));
  });

  it('requires configured webhook signatures for Flutterwave and Stripe', () => {
    expect(verifyFlutterwaveWebhook('flutterwave-hash')).toBe(true);
    expect(verifyFlutterwaveWebhook('wrong-hash')).toBe(false);

    const body = Buffer.from('{"type":"checkout.session.completed"}');
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = crypto.createHmac('sha256', state.env.STRIPE_WEBHOOK_SECRET)
      .update(`${timestamp}.${body.toString('utf8')}`).digest('hex');
    expect(verifyStripeWebhook(body, `t=${timestamp},v1=${digest}`)).toBe(true);
    expect(verifyStripeWebhook(body, `t=${timestamp - 600},v1=${digest}`)).toBe(false);
  });
});
