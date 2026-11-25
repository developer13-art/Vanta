import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
}));

vi.mock('../src/server/db', () => ({ withTransaction: state.withTransaction }));

import { deleteBotForUser } from '../src/server/bot-deletion';
import { AppError } from '../src/server/errors';

describe('bot deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.withTransaction.mockImplementation((callback: (client: { query: typeof state.clientQuery }) => Promise<unknown>) =>
      callback({ query: state.clientQuery }),
    );
    state.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM bots')) return { rows: [{ id: 'bot-1' }] };
      if (sql.includes('SELECT count(*) FROM positions')) return { rows: [{ count: '0' }] };
      if (sql.includes('DELETE FROM bots')) return { rows: [{ id: 'bot-1' }] };
      return { rows: [] };
    });
  });

  it('detaches preserved billing records before deleting the bot', async () => {
    await deleteBotForUser('bot-1', 'user-1');

    const ledgerUpdate = state.clientQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE credit_ledger'));
    expect(ledgerUpdate?.[0]).toContain("'deletedBotId', bot_id");
    expect(ledgerUpdate?.[0]).toContain('bot_id=NULL, order_id=NULL, position_id=NULL');
    expect(ledgerUpdate?.[1]).toEqual(['bot-1']);
    expect(state.clientQuery.mock.calls.findIndex(([sql]) => String(sql).includes('UPDATE credit_ledger')))
      .toBeLessThan(state.clientQuery.mock.calls.findIndex(([sql]) => String(sql).includes('DELETE FROM bots')));
    expect(state.clientQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE credit_reservations'))?.[1])
      .toEqual(['bot-1']);
  });

  it('refuses deletion while the bot has open positions', async () => {
    state.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM bots')) return { rows: [{ id: 'bot-1' }] };
      if (sql.includes('SELECT count(*) FROM positions')) return { rows: [{ count: '1' }] };
      return { rows: [] };
    });

    await expect(deleteBotForUser('bot-1', 'user-1'))
      .rejects.toMatchObject<AppError>({ code: 'CONFLICT' });
    expect(state.clientQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM bots'),
      expect.anything(),
    );
  });

  it('does not delete another user’s bot', async () => {
    state.clientQuery.mockResolvedValue({ rows: [] });

    await expect(deleteBotForUser('bot-1', 'user-2'))
      .rejects.toMatchObject<AppError>({ code: 'NOT_FOUND' });
    expect(state.clientQuery).toHaveBeenCalledTimes(1);
  });
});
