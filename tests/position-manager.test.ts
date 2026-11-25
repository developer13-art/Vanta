import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  query: vi.fn(),
  closePosition: vi.fn(),
  fetchBrokerPositions: vi.fn(),
  logger: { warn: vi.fn() },
}));

vi.mock('../src/server/db', () => ({ query: state.query }));
vi.mock('../src/server/execution', () => ({ closePosition: state.closePosition }));
vi.mock('../src/server/broker-providers', () => ({ fetchBrokerPositions: state.fetchBrokerPositions }));
vi.mock('../src/server/logger', () => ({ logger: state.logger }));

import { manageProfitablePositions } from '../src/server/position-manager';

describe('profitable position management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.query.mockResolvedValue({ rows: [{
      id: 'position-1',
      user_id: 'user-1',
      broker_ticket: 'ticket-1',
      broker_account_id: 'account-1',
      connection_provider: 'fxapis',
      provider_account_id: 'provider-account-1',
    }] });
    state.fetchBrokerPositions.mockResolvedValue([
      { id: 'ticket-1', currentPrice: 1.2, profit: 2.5, commission: -0.2, swap: -0.1 },
    ]);
    state.closePosition.mockResolvedValue(undefined);
  });

  it('updates the snapshot and closes when broker-reported net profit is positive', async () => {
    await manageProfitablePositions('account-1');

    const update = state.query.mock.calls.find(([sql]) => String(sql).includes('SET current_price'));
    expect(update?.[1]).toEqual(['position-1', 1.2, expect.any(Number), -0.2, -0.1]);
    expect(update?.[1][2]).toBeCloseTo(2.2);
    expect(state.closePosition).toHaveBeenCalledWith({
      userId: 'user-1',
      positionId: 'position-1',
      closedBy: 'platform',
    });
  });

  it.each([0, -0.01, null])('does not close when profit is %s', async (profit) => {
    state.fetchBrokerPositions.mockResolvedValue([
      { id: 'ticket-1', currentPrice: 1.2, profit, commission: null, swap: null },
    ]);

    await manageProfitablePositions('account-1');

    expect(state.closePosition).not.toHaveBeenCalled();
  });

  it('does not close when commissions and swap make the net result non-positive', async () => {
    state.fetchBrokerPositions.mockResolvedValue([
      { id: 'ticket-1', currentPrice: 1.2, profit: 1, commission: -0.6, swap: -0.5 },
    ]);

    await manageProfitablePositions('account-1');

    expect(state.closePosition).not.toHaveBeenCalled();
  });

  it('keeps positions open when the broker snapshot cannot be fetched', async () => {
    state.fetchBrokerPositions.mockRejectedValue(new Error('Broker unavailable'));

    await manageProfitablePositions('account-1');

    expect(state.closePosition).not.toHaveBeenCalled();
    expect(state.logger.warn).toHaveBeenCalledOnce();
  });
});
