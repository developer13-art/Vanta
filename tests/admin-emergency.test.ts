import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../src/server/db', () => ({
  query: state.query,
  withTransaction: vi.fn(),
}));

import { isHalted } from '../src/server/admin-emergency';

describe('emergency-control matching', () => {
  beforeEach(() => {
    state.query.mockReset().mockResolvedValue({ rows: [] });
  });

  it('compares broker and strategy names as text rather than UUIDs', async () => {
    await expect(isHalted({
      userId: '00000000-0000-4000-8000-000000000001',
      brokerAccountId: '00000000-0000-4000-8000-000000000002',
      brokerName: 'headway',
      strategyName: 'ai_adaptive',
    })).resolves.toEqual({ halted: false });

    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining("scope = 'broker' AND scope_id = $3::text"),
      [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        'headway',
        'ai_adaptive',
      ],
    );
  });
});
