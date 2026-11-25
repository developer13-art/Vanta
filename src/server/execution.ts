import { withTransaction, query } from './db';
import { Errors } from './errors';
import { logger } from './logger';
import { closeBrokerPosition, submitBrokerMarketOrder } from './broker-providers';
import type { BrokerOrderResult } from './broker-providers';
import type { BrokerProvider } from '../shared/types';
import { chargeOrderOpen } from './billing';
import { enqueue } from './jobs';
import { randomUUID } from 'node:crypto';

export interface SubmitOrderArgs {
  userId: string;
  botId: string;
  brokerAccountId: string;
  connectionProvider: BrokerProvider;
  providerAccountId: string;
  brokerSymbolId: string;
  brokerSymbol: string;
  side: 'buy' | 'sell';
  volume: number;
  idempotencyKey?: string;
  comment?: string;
}

export interface SubmitOrderResult {
  orderId: string;
  brokerTicket: string | null;
  status: 'accepted' | 'rejected' | 'unknown' | 'duplicate';
  message?: string;
}

/**
 * Idempotent order submission:
 * 1. INSERT with idempotency_key UNIQUE — if conflict, return 'duplicate' without calling broker.
 * 2. Submit through the selected broker provider.
 * 3. Update order row with broker response.
 * 4. Charge credits only on broker-confirmed acceptance.
 * 5. Schedule reconciliation if outcome is ambiguous (timeout).
 */
export async function submitOrder(args: SubmitOrderArgs): Promise<SubmitOrderResult> {
  const idempotencyKey = args.idempotencyKey ?? randomUUID();

  const insertRes = await query<{ id: string }>(
    `INSERT INTO orders
       (bot_id, broker_account_id, broker_symbol_id, idempotency_key,
        side, volume, status, request_payload)
     VALUES ($1,$2,$3,$4,$5,$6,'pending',$7)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      args.botId,
      args.brokerAccountId,
      args.brokerSymbolId,
      idempotencyKey,
      args.side,
      args.volume,
      JSON.stringify({ side: args.side, volume: args.volume, symbol: args.brokerSymbol }),
    ],
  );

  if (insertRes.rows.length === 0) {
    const existing = await query<{ id: string; broker_ticket: string | null; status: string }>(
      `SELECT id, broker_ticket, status FROM orders WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    return {
      orderId: existing.rows[0].id,
      brokerTicket: existing.rows[0].broker_ticket,
      status: 'duplicate',
      message: 'Order already submitted',
    };
  }

  const orderId = insertRes.rows[0].id;

  let brokerResult;
  try {
    brokerResult = await submitBrokerMarketOrder(
      args.connectionProvider,
      args.providerAccountId,
      {
        symbol: args.brokerSymbol,
        side: args.side,
        volume: args.volume,
        comment: args.comment ?? `vanta:${orderId}`,
        clientId: orderId,
      },
      idempotencyKey,
    );
  } catch (err) {
    logger.warn({ err, orderId }, 'Broker submit failed — marking unknown, queuing reconciliation');
    await query(
      `UPDATE orders SET status='unknown', broker_response=$2 WHERE id=$1`,
      [orderId, JSON.stringify({ error: err instanceof Error ? err.message : String(err) })],
    );
    await enqueue('reconciliation', { orderId }, { runAt: new Date(Date.now() + 30_000), maxAttempts: 10 });
    return { orderId, brokerTicket: null, status: 'unknown', message: 'Reconciliation scheduled' };
  }

  if (brokerResult.status === 'rejected') {
    await query(
      `UPDATE orders
          SET status='rejected', broker_response=$2, rejection_reason=$3, acknowledged_at=now()
        WHERE id=$1`,
      [orderId, JSON.stringify(brokerResult), brokerResult.message ?? 'rejected'],
    );
    return { orderId, brokerTicket: null, status: 'rejected', message: brokerResult.message };
  }

  if (brokerResult.status === 'unknown' || !brokerResult.ticket) {
    await query(
      `UPDATE orders SET status='unknown', provider_order_id=$2, broker_response=$3 WHERE id=$1`,
      [orderId, brokerResult.providerOrderId, JSON.stringify(brokerResult)],
    );
    await enqueue('reconciliation', { orderId }, { runAt: new Date(Date.now() + 30_000), maxAttempts: 10 });
    return {
      orderId,
      brokerTicket: null,
      status: 'unknown',
      message: brokerResult.message ?? 'The broker is still confirming this order.',
    };
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE orders
          SET status='accepted', broker_ticket=$2, provider_order_id=$3, broker_response=$4,
              filled_price=$5, acknowledged_at=now(), filled_at=now()
        WHERE id=$1`,
      [orderId, brokerResult.ticket, brokerResult.providerOrderId, JSON.stringify(brokerResult), brokerResult.price],
    );

    // Track the resulting position immediately so risk engine sees it.
    await client.query(
      `INSERT INTO positions
         (bot_id, broker_account_id, broker_symbol_id, opening_order_id,
          broker_ticket, side, volume, entry_price, opened_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (broker_account_id, broker_ticket) DO NOTHING`,
      [
        args.botId, args.brokerAccountId, args.brokerSymbolId, orderId,
        brokerResult.ticket, args.side, brokerResult.volume, brokerResult.price,
      ],
    );
  });

  // Charge only now — broker confirmed.
  try {
    await chargeOrderOpen({
      userId: args.userId,
      botId: args.botId,
      brokerAccountId: args.brokerAccountId,
      orderId,
      brokerTicket: brokerResult.ticket,
    });
  } catch (err) {
    // Billing failure must not roll back a confirmed trade. Log and alert.
    logger.error({ err, orderId }, 'Billing failed for confirmed order');
    await enqueue('notification_dispatch', {
      userId: args.userId,
      category: 'wallet',
      severity: 'critical',
      title: 'Billing error',
      body: 'Your order was executed but we failed to charge credits. Support has been notified.',
    });
  }

  await enqueue('position_check', { orderId }, { runAt: new Date(Date.now() + 5_000) });

  return {
    orderId,
    brokerTicket: brokerResult.ticket,
    status: 'accepted',
    message: brokerResult.message,
  };
}

export async function closePosition(args: {
  userId: string;
  positionId: string;
  closedBy?: 'user' | 'platform';
}): Promise<void> {
  const pos = await query<{
    id: string; bot_id: string; broker_account_id: string; broker_ticket: string;
    broker_symbol_id: string; broker_symbol: string; side: 'buy' | 'sell'; volume: number;
    closed_at: string | null; connection_provider: BrokerProvider; provider_account_id: string;
  }>(
    `SELECT p.id, p.bot_id, p.broker_account_id, p.broker_ticket, p.broker_symbol_id,
            p.side, p.volume, p.closed_at, s.broker_symbol,
            b.connection_provider, b.provider_account_id
       FROM positions p
       JOIN broker_symbols s ON s.id = p.broker_symbol_id
       JOIN broker_accounts b ON b.id = p.broker_account_id
      WHERE p.id = $1`,
    [args.positionId],
  );
  const position = pos.rows[0];
  if (!position) throw Errors.notFound('Position not found');
  if (position.closed_at) throw Errors.conflict('Position already closed');

  const b = await query<{ user_id: string }>(`SELECT user_id FROM broker_accounts WHERE id=$1`, [position.broker_account_id]);
  if (b.rows[0]?.user_id !== args.userId) throw Errors.forbidden();

  const closeSide = position.side === 'buy' ? 'sell' : 'buy';
  const previousClose = await query<{ id: string; status: string }>(
    `SELECT id, status
       FROM orders
      WHERE broker_account_id = $1
        AND request_payload->>'closePositionId' = $2
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [position.broker_account_id, position.id],
  );
  const previousAttempt = previousClose.rows[0];
  if (previousAttempt && !['rejected', 'failed', 'cancelled'].includes(previousAttempt.status)) return;
  const idempotencyKey = previousAttempt
    ? `close-position:${position.id}:retry:${previousAttempt.id}`
    : `close-position:${position.id}`;

  const insertRes = await query<{ id: string }>(
    `INSERT INTO orders
       (bot_id, broker_account_id, broker_symbol_id, idempotency_key,
        side, volume, status, request_payload)
     VALUES ($1,$2,$3,$4,$5,$6,'pending',$7)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      position.bot_id, position.broker_account_id, position.broker_symbol_id,
      idempotencyKey, closeSide, position.volume,
      JSON.stringify({ closePositionId: position.id }),
    ],
  );
  if (insertRes.rows.length === 0) return;
  const orderId = insertRes.rows[0].id;

  let result: BrokerOrderResult;
  try {
    result = await closeBrokerPosition(
      position.connection_provider,
      position.provider_account_id,
      {
        ticket: position.broker_ticket,
        symbol: position.broker_symbol,
        side: position.side,
        volume: position.volume,
        clientId: orderId,
        idempotencyKey,
      },
    );
  } catch (err) {
    await query(`UPDATE orders SET status='unknown', broker_response=$2 WHERE id=$1`, [
      orderId,
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
    ]);
    await enqueue('reconciliation', { brokerAccountId: position.broker_account_id }, {
      runAt: new Date(Date.now() + 30_000), maxAttempts: 10,
    });
    throw err;
  }

  if (result.status === 'rejected') {
    await query(
      `UPDATE orders SET status='rejected', provider_order_id=$2, broker_response=$3,
              rejection_reason=$4, acknowledged_at=now()
        WHERE id=$1`,
      [orderId, result.providerOrderId, JSON.stringify(result), result.message ?? 'rejected'],
    );
    throw Errors.unprocessable(result.message ?? 'The broker rejected the close request.');
  }
  if (result.status !== 'accepted' || !result.ticket) {
    await query(
      `UPDATE orders SET status='unknown', provider_order_id=$2, broker_response=$3 WHERE id=$1`,
      [orderId, result.providerOrderId, JSON.stringify(result)],
    );
    await enqueue('reconciliation', { brokerAccountId: position.broker_account_id }, {
      runAt: new Date(Date.now() + 30_000), maxAttempts: 10,
    });
    throw Errors.unavailable(result.message ?? 'The broker is still confirming the close request.');
  }

  try {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE positions
            SET closed_at = now(), close_price = $2, management_state = 'closing',
                closed_by = $3
          WHERE id = $1`,
        [position.id, result.price, args.closedBy ?? 'user'],
      );
      await client.query(
        `UPDATE orders
            SET status='accepted', broker_ticket=$2, provider_order_id=$3, filled_price=$4,
                broker_response=$5, acknowledged_at=now(), filled_at=now()
          WHERE id=$1`,
        [orderId, result.ticket, result.providerOrderId, result.price, JSON.stringify(result)],
      );
    });
  } catch (err) {
    await query(
      `UPDATE orders SET status='unknown', provider_order_id=$2, broker_response=$3 WHERE id=$1`,
      [orderId, result.providerOrderId, JSON.stringify({ ...result, databaseError: true })],
    );
    await enqueue('reconciliation', { brokerAccountId: position.broker_account_id }, {
      runAt: new Date(Date.now() + 30_000), maxAttempts: 10,
    });
    throw err;
  }

  try {
    await chargeOrderClose({
      userId: args.userId,
      botId: position.bot_id,
      brokerAccountId: position.broker_account_id,
      orderId,
      brokerTicket: result.ticket,
    });
  } catch (err) {
    logger.error({ err, orderId }, 'Billing failed for confirmed position close');
    await enqueue('notification_dispatch', {
      userId: args.userId,
      category: 'wallet',
      severity: 'critical',
      title: 'Billing error',
      body: 'Your position was closed but we failed to charge credits. Support has been notified.',
    });
  }
  await enqueue('reconciliation', { brokerAccountId: position.broker_account_id }, {
    runAt: new Date(Date.now() + 10_000),
  });
}

async function chargeOrderClose(args: {
  userId: string;
  botId: string;
  brokerAccountId: string;
  orderId: string;
  brokerTicket: string;
}): Promise<void> {
  // Imported inline to avoid circular import with billing.ts
  const { chargeOrderClose: charge } = await import('./billing');
  await charge(args);
}