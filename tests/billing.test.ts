import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/server/ledger', () => ({
  applyLedger: vi.fn().mockResolvedValue(100),
}));

vi.mock('../src/server/credit-rates', () => ({
  RATES: { openOrder: 2, closeOrder: 2, aiAssessment: 2 },
  RATE_VERSION: 'test-v1',
}));

import { applyLedger } from '../src/server/ledger';
import { chargeOrderOpen, chargeOrderClose, chargeAiAssessment } from '../src/server/billing';

describe('billing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('charges open order with correct delta and idempotency key', async () => {
    await chargeOrderOpen({
      userId: 'u1', botId: 'b1', brokerAccountId: 'a1',
      orderId: 'o1', brokerTicket: 'T100',
    });
    expect(applyLedger).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      delta: -2,
      eventType: 'charge_open',
      idempotencyKey: 'open:T100',
    }));
  });

  it('charges close order with correct delta and idempotency key', async () => {
    await chargeOrderClose({
      userId: 'u1', botId: 'b1', brokerAccountId: 'a1',
      orderId: 'o2', brokerTicket: 'T101',
    });
    expect(applyLedger).toHaveBeenCalledWith(expect.objectContaining({
      delta: -2,
      eventType: 'charge_close',
      idempotencyKey: 'close:T101',
    }));
  });

  it('charges AI assessment with correct idempotency key', async () => {
    await chargeAiAssessment({
      userId: 'u1', botId: 'b1', brokerAccountId: 'a1', decisionId: 'd1',
    });
    expect(applyLedger).toHaveBeenCalledWith(expect.objectContaining({
      delta: -2,
      eventType: 'charge_ai',
      idempotencyKey: 'ai:d1',
    }));
  });
});