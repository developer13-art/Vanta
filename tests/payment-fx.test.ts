import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: { PAYMENT_FX_API_URL: 'https://rates.example.test/latest/USD' },
  fetch: vi.fn(),
}));

vi.mock('../src/server/env', () => ({ env: state.env }));
vi.mock('../src/server/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { quoteUsdAmount } from '../src/server/payment-fx';

function ratesResponse(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    result: 'success',
    base_code: 'USD',
    time_last_update_unix: now - 60,
    time_next_update_unix: now + 3600,
    rates: {
      USD: 1, NGN: 1500, GBP: 0.8, EUR: 0.9, JPY: 149.7, MXN: 18,
      GHS: 12, KES: 130, UGX: 3800, TZS: 2500, RWF: 1300, ZAR: 18,
    },
    ...overrides,
  };
}

describe('payment exchange-rate quotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', state.fetch);
  });

  it('rejects invalid rate data and rounds USD package prices to currency minor units', async () => {
    state.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...ratesResponse(), rates: { USD: 1 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ratesResponse() });

    await expect(quoteUsdAmount(8, 'NGN')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(quoteUsdAmount(8, 'JPY')).resolves.toMatchObject({ amount: 1198, rate: 149.7 });
    await expect(quoteUsdAmount(8, 'NGN')).resolves.toMatchObject({ amount: 12000, rate: 1500 });
  });
});
