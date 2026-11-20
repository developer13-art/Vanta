import { applyLedger } from './ledger';
import { RATES, RATE_VERSION } from './credit-rates';

// Charges happen only after broker confirms. All charges are idempotent via
// idempotency keys derived from the underlying broker reference.

export async function chargeOrderOpen(args: {
  userId: string;
  botId: string;
  brokerAccountId: string;
  orderId: string;
  brokerTicket: string;
}): Promise<void> {
  await applyLedger({
    userId: args.userId,
    delta: -RATES.openOrder,
    eventType: 'charge_open',
    reason: 'open_order_confirmed',
    botId: args.botId,
    brokerAccountId: args.brokerAccountId,
    orderId: args.orderId,
    rateVersion: RATE_VERSION,
    idempotencyKey: `open:${args.brokerTicket}`,
    metadata: { brokerTicket: args.brokerTicket },
  });
}

export async function chargeOrderClose(args: {
  userId: string;
  botId: string;
  brokerAccountId: string;
  orderId: string;
  brokerTicket: string;
}): Promise<void> {
  await applyLedger({
    userId: args.userId,
    delta: -RATES.closeOrder,
    eventType: 'charge_close',
    reason: 'close_order_confirmed',
    botId: args.botId,
    brokerAccountId: args.brokerAccountId,
    orderId: args.orderId,
    rateVersion: RATE_VERSION,
    idempotencyKey: `close:${args.brokerTicket}`,
    metadata: { brokerTicket: args.brokerTicket },
  });
}

export async function chargeAiAssessment(args: {
  userId: string;
  botId: string;
  brokerAccountId: string;
  decisionId: string;
}): Promise<void> {
  await applyLedger({
    userId: args.userId,
    delta: -RATES.aiAssessment,
    eventType: 'charge_ai',
    reason: 'ai_assessment',
    botId: args.botId,
    brokerAccountId: args.brokerAccountId,
    rateVersion: RATE_VERSION,
    idempotencyKey: `ai:${args.decisionId}`,
    metadata: { decisionId: args.decisionId },
  });
}