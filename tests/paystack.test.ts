import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/server/db', () => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock('../src/server/ledger', () => ({ applyLedgerInTransaction: vi.fn() }));
vi.mock('../src/server/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { query, withTransaction } from '../src/server/db';
import { applyLedgerInTransaction } from '../src/server/ledger';
import { logger } from '../src/server/logger';
import { initPayment, verifyPaymentForUser } from '../src/server/paystack';

const validEmail = 'trader@example.com';

describe('Paystack payment initialization', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('rejects invalid account email before contacting Paystack', async () => {
    await expect(initPayment({ userId: 'user-12345678', email: 'not-an-email', packageCode: 'starter' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST', statusCode: 400 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('trims and lowercases the account email for checkout', async () => {
    fetchMock.mockImplementation(async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body)) as { reference: string };
      return {
        ok: true,
        json: async () => ({
          status: true,
          data: { authorization_url: 'https://paystack.test/checkout', reference: requestBody.reference },
        }),
      } as Response;
    });
    vi.mocked(query).mockResolvedValue({
      command: 'INSERT',
      rowCount: 1,
      oid: 0,
      fields: [],
      rows: [],
    });

    await initPayment({ userId: 'user-12345678', email: ' Trader@Example.com ', packageCode: 'starter' });

    const [request] = fetchMock.mock.calls;
    if (!request) throw new Error('Expected Paystack request');
    const requestBody = JSON.parse(String(request[1]?.body)) as { email: string };
    expect(requestBody.email).toBe(validEmail);
  });

  it('returns an actionable error when Paystack rejects the email', async () => {
    const providerMessage = '"email" must be a valid email';
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: providerMessage }),
    } as Response);

    await expect(initPayment({ userId: 'user-12345678', email: validEmail, packageCode: 'starter' }))
      .rejects.toMatchObject({
        code: 'BAD_REQUEST',
        statusCode: 400,
        message: expect.stringContaining('support@vantatrade.ai'),
      });

    expect(logger.error).toHaveBeenCalledWith(
      { status: 400, reason: 'invalid_email' },
      'Paystack init failed',
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('grants credits after Paystack verifies a successful transaction', async () => {
    const payment = {
      id: 'payment-1',
      user_id: 'user-1',
      credits_granted: 100,
      package_code: 'starter',
      amount: '12000',
      currency: 'NGN',
      status: 'pending',
    };
    vi.mocked(query).mockResolvedValueOnce({
      command: 'SELECT', rowCount: 1, oid: 0, fields: [], rows: [payment],
    });
    const transactionQuery = vi.fn().mockResolvedValueOnce({
      command: 'SELECT', rowCount: 1, oid: 0, fields: [], rows: [payment],
    }).mockResolvedValue({
      command: 'UPDATE', rowCount: 1, oid: 0, fields: [], rows: [],
    });
    vi.mocked(withTransaction).mockImplementation(async (callback) => callback({
      query: transactionQuery,
    } as never));
    vi.mocked(applyLedgerInTransaction).mockResolvedValue(100);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        data: { reference: 'ref-1', status: 'success', amount: 1_200_000, currency: 'NGN' },
      }),
    } as Response);

    await expect(verifyPaymentForUser('ref-1', 'user-1')).resolves.toEqual({
      status: 'successful',
      creditsGranted: 100,
    });

    expect(applyLedgerInTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: 'user-1',
      delta: 100,
      eventType: 'purchase',
      idempotencyKey: 'purchase:ref-1',
    }));
  });

  it('does not grant credits when the verified currency differs from the purchase', async () => {
    const payment = {
      id: 'payment-1',
      user_id: 'user-1',
      credits_granted: 100,
      package_code: 'starter',
      amount: '12000',
      currency: 'NGN',
      status: 'pending',
    };
    vi.mocked(query).mockResolvedValueOnce({
      command: 'SELECT', rowCount: 1, oid: 0, fields: [], rows: [payment],
    });
    const transactionQuery = vi.fn().mockResolvedValueOnce({
      command: 'SELECT', rowCount: 1, oid: 0, fields: [], rows: [payment],
    }).mockResolvedValue({
      command: 'UPDATE', rowCount: 1, oid: 0, fields: [], rows: [],
    });
    vi.mocked(withTransaction).mockImplementation(async (callback) => callback({
      query: transactionQuery,
    } as never));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        data: { reference: 'ref-1', status: 'success', amount: 1_200_000, currency: 'USD' },
      }),
    } as Response);

    await expect(verifyPaymentForUser('ref-1', 'user-1')).resolves.toEqual({ status: 'failed' });
    expect(applyLedgerInTransaction).not.toHaveBeenCalled();
  });

  it('does not verify or credit a payment that is already successful', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      command: 'SELECT',
      rowCount: 1,
      oid: 0,
      fields: [],
      rows: [{
        id: 'payment-1',
        user_id: 'user-1',
        credits_granted: 100,
        package_code: 'starter',
        amount: '12000',
        currency: 'NGN',
        status: 'successful',
      }],
    });

    await expect(verifyPaymentForUser('ref-1', 'user-1')).resolves.toEqual({
      status: 'successful',
      creditsGranted: 100,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
    expect(applyLedgerInTransaction).not.toHaveBeenCalled();
  });
});
