import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  env: {
    AI_ENABLED: true,
    AI_PROVIDER_URL: 'https://ai.example.test/v1',
    AI_API_KEY: 'test-key',
    AI_MODEL: 'test-model',
    AI_TIMEOUT_MS: 1000,
  },
  fetch: vi.fn(),
}));

vi.mock('../src/server/env', () => ({ env: state.env }));

import { getAiAssessments } from '../src/server/ai-context';

const context = {
  timeframe: '1m',
  bot: {},
  account: {},
  markets: [{ symbol: 'EURUSD', indicators: { rsi14: 54 } }],
};

describe('AI batch assessments', () => {
  beforeEach(() => {
    state.env.AI_ENABLED = true;
    state.fetch.mockReset();
    vi.stubGlobal('fetch', state.fetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('accepts a complete, bounded decision batch', async () => {
    state.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              decisions: [{
                symbol: 'EURUSD',
                verdict: 'HOLD',
                confidence: 0.72,
                reasoning: 'Momentum is mixed.',
              }],
            }),
          },
        }],
      }),
    });

    await expect(getAiAssessments(context)).resolves.toEqual([{
      symbol: 'EURUSD',
      verdict: 'HOLD',
      confidence: 0.72,
      reasoning: 'Momentum is mixed.',
    }]);
  });

  it('rejects an invalid or incomplete batch instead of permitting a trade', async () => {
    state.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              decisions: [{
                symbol: 'EURUSD',
                verdict: 'BUY',
                confidence: 1.2,
                reasoning: 'Invalid confidence.',
              }],
            }),
          },
        }],
      }),
    });

    await expect(getAiAssessments(context)).rejects.toThrow('invalid or unexpected');
  });

  it('does not call the provider when AI is disabled', async () => {
    state.env.AI_ENABLED = false;

    await expect(getAiAssessments(context)).rejects.toThrow('disabled or not configured');
    expect(state.fetch).not.toHaveBeenCalled();
  });
});
