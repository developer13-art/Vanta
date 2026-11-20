import { query, withTransaction } from './db';
import { logger } from './logger';
import { fetchOpenPositions } from './metaapi';
import { chargeOrderClose } from './billing';

/**
 * Reconcile platform state with broker-confirmed state.
 * Detects:
 *  - Manual broker-side closes (position gone but platform says open)
 *  - Unknown/ambiguous order outcomes
 *  - Orphan positions (broker has, platform doesn't)
 */
export async function reconcileBrokerAccount(brokerAccountId: string): Promise<void> {
  const acc = await query<{
    id: string; user_id: string; metaapi_account_id: string;
  }>(`SELECT id, user_id, metaapi_account_id FROM broker_accounts WHERE id = $1`, [brokerAccountId]);
  const account = acc.rows[0];
  if (!account) return;

  let brokerPositions: Array<{ id: string; symbol: string; volume: number; type: string; openPrice: number }>;
  try {
    brokerPositions = await fetchOpenPositions(account.metaapi_account_id);
  } catch (err) {
    logger.warn({ err, brokerAccountId }, 'Reconciliation: broker fetch failed');
    return;
  }

  const brokerTickets = new Set(brokerPositions.map((p) => String(p.id)));

  const open = await query<{
    id: string; bot_id: string; broker_ticket: string; side: string; volume: number;
    entry_price: string; broker_symbol_id: string; opening_order_id: string | null;
  }>(
    `SELECT id, bot_id, broker_ticket, side, volume, entry_price, broker_symbol_id, opening_order_id
       FROM positions
      WHERE broker_account_id = $1 AND closed_at IS NULL`,
    [brokerAccountId],
  );

  // 1. Platform says open, broker doesn't have it → manual close or SL/TP hit
  for (const row of open.rows) {
    if (!brokerTickets.has(row.broker_ticket)) {
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE positions
              SET closed_at = now(), management_state = 'closing',
                  source = 'manual_broker', closed_by = 'broker'
            WHERE id = $1`,
          [row.id],
        );
        if (row.opening_order_id) {
          // Charge the close action idempotently
          try {
            await chargeOrderClose({
              userId: account.user_id,
              botId: row.bot_id,
              brokerAccountId,
              orderId: row.opening_order_id,
              brokerTicket: row.broker_ticket,
            });
          } catch (err) {
            logger.warn({ err, positionId: row.id }, 'Reconciliation: close charge failed');
          }
        }
      });
    }
  }

  // 2. Broker has position, platform doesn't → orphan (user opened manually)
  const platformTickets = new Set(open.rows.map((r) => r.broker_ticket));
  for (const bp of brokerPositions) {
    const ticket = String(bp.id);
    if (platformTickets.has(ticket)) continue;

    const symbolRow = await query<{ id: string }>(
      `SELECT id FROM broker_symbols WHERE broker_account_id = $1 AND broker_symbol = $2 LIMIT 1`,
      [brokerAccountId, bp.symbol],
    );
    const symbolId = symbolRow.rows[0]?.id;
    if (!symbolId) {
      logger.warn({ brokerAccountId, symbol: bp.symbol }, 'Orphan position with unknown symbol — skipped');
      continue;
    }

    // Bot is unknown (user-created). Attach to first bot on account or skip.
    const botRow = await query<{ id: string }>(
      `SELECT id FROM bots WHERE broker_account_id = $1 LIMIT 1`,
      [brokerAccountId],
    );
    const botId = botRow.rows[0]?.id;
    if (!botId) continue;

    await query(
      `INSERT INTO positions
         (bot_id, broker_account_id, broker_symbol_id, broker_ticket, side, volume,
          entry_price, opened_at, source, management_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now(), 'manual_broker', 'manual_override')
       ON CONFLICT (broker_account_id, broker_ticket) DO NOTHING`,
      [
        botId, brokerAccountId, symbolId, ticket,
        bp.type === 'POSITION_TYPE_BUY' ? 'buy' : 'sell',
        bp.volume, bp.openPrice,
      ],
    );
  }
}

export async function reconcileOrder(orderId: string): Promise<void> {
  const res = await query<{
    id: string; broker_ticket: string | null; broker_account_id: string;
    idempotency_key: string; status: string; side: string; volume: number;
    broker_symbol: string; metaapi_account_id: string; user_id: string; bot_id: string;
  }>(
    `SELECT o.id, o.broker_ticket, o.broker_account_id, o.idempotency_key, o.status,
            o.side, o.volume, s.broker_symbol, b.metaapi_account_id, b.user_id, o.bot_id
       FROM orders o
       JOIN broker_symbols s ON s.id = o.broker_symbol_id
       JOIN broker_accounts b ON b.id = o.broker_account_id
      WHERE o.id = $1`,
    [orderId],
  );
  const order = res.rows[0];
  if (!order || order.status !== 'unknown') return;

  const positions = await fetchOpenPositions(order.metaapi_account_id);
  const match = positions.find((p) =>
    // MetaApi may return position with comment carrying our order id in clientId
    (p as unknown as { clientId?: string }).clientId === order.id,
  );

  if (match) {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE orders
            SET status='accepted', broker_ticket=$2, filled_price=$3,
                acknowledged_at=now(), filled_at=now()
          WHERE id=$1`,
        [orderId, String(match.id), match.openPrice],
      );
      await client.query(
        `INSERT INTO positions
           (bot_id, broker_account_id, broker_symbol_id, opening_order_id,
            broker_ticket, side, volume, entry_price, opened_at)
         VALUES ($1,$2,(SELECT broker_symbol_id FROM orders WHERE id=$3),$3,
                 $4,$5,$6,$7, now())
         ON CONFLICT (broker_account_id, broker_ticket) DO NOTHING`,
        [
          order.bot_id, order.broker_account_id, orderId,
          String(match.id), order.side, match.volume, match.openPrice,
        ],
      );
    });
    logger.info({ orderId }, 'Reconciled unknown order as accepted');
  } else {
    await query(`UPDATE orders SET status='rejected', rejection_reason='broker_no_record' WHERE id=$1`, [orderId]);
    logger.info({ orderId }, 'Reconciled unknown order as rejected');
  }
}