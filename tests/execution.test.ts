import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  query: vi.fn(),
  closeBrokerPosition: vi.fn(),
  enqueue: vi.fn(),
  transactionQuery: vi.fn(),
  chargeOrderClose: vi.fn(),
}));

vi.mock('../src/server/db', () => ({
  query: state.query,
  withTransaction: (callback: (client: { query: typeof state.transactionQuery }) => Promise<unknown>) =>
    callback({ query: state.transactionQuery }),
}));
vi.mock('../src/server/broker-providers', () => ({
  closeBrokerPosition: state.closeBrokerPosition,
  submitBrokerMarketOrder: vi.fn(),
}));
vi.mock('../src/server/jobs', () => ({ enqueue: state.enqueue }));
vi.mock('../src/server/billing', () => ({ chargeOrderClose: state.chargeOrderClose }));
vi.mock('../src/server/logger', () => ({ logger: { error: vi.fn() } }));

import { closePosition } from '../src/server/execution';

describe('close position execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM positions p')) {
        return { rows: [{
          id: 'position-1',
          bot_id: 'bot-1',
          broker_account_id: 'account-1',
          broker_ticket: 'ticket-1',
          broker_symbol_id: 'symbol-1',
          broker_symbol: 'EURUSD',
          side: 'buy',
          volume: '0.0100',
          closed_at: null,
          connection_provider: 'fxapis',
          provider_account_id: 'provider-account-1',
        }] };
      }
      if (sql.includes('SELECT user_id FROM broker_accounts')) return { rows: [{ user_id: 'user-1' }] };
      if (sql.includes('SELECT id, status')) return { rows: [] };
      if (sql.includes('INSERT INTO orders')) return { rows: [{ id: 'order-1' }] };
      return { rows: [] };
    });
    state.closeBrokerPosition.mockResolvedValue({
      ticket: 'ticket-1',
      providerOrderId: 'provider-order-1',
      price: 1.1,
      volume: 0.01,
      status: 'accepted',
    });
  });

  it('converts PostgreSQL numeric volume strings before sending a broker close request', async () => {
    await closePosition({ userId: 'user-1', positionId: 'position-1', closedBy: 'platform' });

    expect(state.closeBrokerPosition).toHaveBeenCalledWith(
      'fxapis',
      'provider-account-1',
      expect.objectContaining({ ticket: 'ticket-1', volume: 0.01 }),
    );
    expect(state.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO orders'))?.[1])
      .toEqual(expect.arrayContaining(['close-position:position-1', 'sell', 0.01]));
  });

  it('refuses to submit a close when the stored volume is invalid', async () => {
    state.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM positions p')) {
        return { rows: [{
          id: 'position-1',
          bot_id: 'bot-1',
          broker_account_id: 'account-1',
          broker_ticket: 'ticket-1',
          broker_symbol_id: 'symbol-1',
          broker_symbol: 'EURUSD',
          side: 'buy',
          volume: 'not-a-volume',
          closed_at: null,
          connection_provider: 'fxapis',
          provider_account_id: 'provider-account-1',
        }] };
      }
      return { rows: [] };
    });

    await expect(closePosition({ userId: 'user-1', positionId: 'position-1' }))
      .rejects.toThrow('Position has an invalid volume');
    expect(state.closeBrokerPosition).not.toHaveBeenCalled();
  });
});
