import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
}));

vi.mock('../src/server/db', () => ({ withTransaction: state.withTransaction }));

import { updateBotConfiguration } from '../src/server/bot-configuration';
import type { updateBotSchema } from '../src/server/schema';

const config: typeof updateBotSchema._type = {
  name: 'Updated Bot',
  brokerSymbolIds: ['symbol-1'],
  lotSize: 0.1,
  entryBatchSize: 2,
  maxConcurrentPositions: 4,
  dailyLossLimit: 100,
  drawdownLimit: 200,
  marginUtilizationLimit: 50,
  maxSpreadPoints: null,
  cooldownSeconds: 30,
  stopBehavior: 'stop_new_manage_existing',
};

describe('bot configuration updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.withTransaction.mockImplementation((callback: (client: { query: typeof state.clientQuery }) => Promise<unknown>) =>
      callback({ query: state.clientQuery }),
    );
    state.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT broker_account_id, state')) {
        return { rows: [{ broker_account_id: 'account-1', state: 'paused' }] };
      }
      if (sql.includes('SELECT id FROM broker_symbols')) return { rows: [{ id: 'symbol-1' }] };
      return { rows: [] };
    });
  });

  it('updates bot fields and replaces its selected instruments transactionally', async () => {
    await updateBotConfiguration('bot-1', 'user-1', config);

    expect(state.withTransaction).toHaveBeenCalledOnce();
    const update = state.clientQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE bots'));
    expect(update?.[1]).toEqual([
      'bot-1', 'user-1', config.name, config.lotSize, config.entryBatchSize,
      config.maxConcurrentPositions, config.dailyLossLimit, config.drawdownLimit,
      config.marginUtilizationLimit, config.maxSpreadPoints, config.cooldownSeconds,
      config.stopBehavior,
    ]);
    expect(state.clientQuery).toHaveBeenCalledWith(
      'INSERT INTO bot_instruments (bot_id, broker_symbol_id) VALUES ($1,$2)',
      ['bot-1', 'symbol-1'],
    );
  });

  it('rejects configuration changes while the bot is running', async () => {
    state.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT broker_account_id, state')) {
        return { rows: [{ broker_account_id: 'account-1', state: 'running' }] };
      }
      return { rows: [] };
    });

    await expect(updateBotConfiguration('bot-1', 'user-1', config))
      .rejects.toMatchObject({ code: 'CONFLICT' });
    expect(state.clientQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects instruments that do not belong to the bot broker account', async () => {
    state.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT broker_account_id, state')) {
        return { rows: [{ broker_account_id: 'account-1', state: 'paused' }] };
      }
      if (sql.includes('SELECT id FROM broker_symbols')) return { rows: [] };
      return { rows: [] };
    });

    await expect(updateBotConfiguration('bot-1', 'user-1', config))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(state.clientQuery).toHaveBeenCalledTimes(2);
  });
});
