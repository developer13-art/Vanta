import { Router } from 'express';
import { query } from '../db';
import { requireAuth } from '../middleware';
import { Errors } from '../errors';

export const historyRouter = Router();

historyRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { brokerAccountId, botId, from, to } = req.query as Record<string, string | undefined>;
    const conditions: string[] = ['b.user_id = $1', 'p.closed_at IS NOT NULL'];
    const params: unknown[] = [req.userId];

    if (brokerAccountId) { params.push(brokerAccountId); conditions.push(`p.broker_account_id = $${params.length}`); }
    if (botId) { params.push(botId); conditions.push(`p.bot_id = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`p.closed_at >= $${params.length}::timestamptz`); }
    if (to) { params.push(to); conditions.push(`p.closed_at <= $${params.length}::timestamptz`); }

    const rows = await query(
      `SELECT p.id, p.broker_ticket, p.side, p.volume, p.entry_price, p.close_price,
              p.realized_pl, p.commission, p.swap, p.opened_at, p.closed_at, p.closed_by,
              b.id AS bot_id, b.name AS bot_name,
              s.broker_symbol, s.canonical_symbol,
              ba.id AS broker_account_id, ba.label AS broker_account_label
         FROM positions p
         JOIN bots b ON b.id = p.bot_id
         JOIN broker_symbols s ON s.id = p.broker_symbol_id
         JOIN broker_accounts ba ON ba.id = p.broker_account_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.closed_at DESC
        LIMIT 1000`,
      params,
    );

    // Attach credit charges from ledger
    const ids = rows.rows.map((r) => r.id);
    const ledgerMap = new Map<string, Array<{ event_type: string; delta: number; created_at: string }>>();
    if (ids.length > 0) {
      const charges = await query(
        `SELECT position_id, event_type, delta, created_at
           FROM credit_ledger
          WHERE position_id = ANY($1::uuid[]) AND user_id = $2
          ORDER BY created_at`,
        [ids, req.userId],
      );
      for (const c of charges.rows) {
        const list = ledgerMap.get(c.position_id) ?? [];
        list.push({ event_type: c.event_type, delta: c.delta, created_at: c.created_at });
        ledgerMap.set(c.position_id, list);
      }
    }

    res.json(rows.rows.map((r) => ({ ...r, credit_events: ledgerMap.get(r.id) ?? [] })));
  } catch (err) { next(err); }
});

historyRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const posRes = await query(
      `SELECT p.id, p.broker_ticket, p.side, p.volume, p.entry_price, p.close_price,
              p.realized_pl, p.commission, p.swap, p.opened_at, p.closed_at, p.closed_by,
              p.floating_pl, p.current_price, p.management_state,
              b.id AS bot_id, b.name AS bot_name, b.strategy_version_id,
              sv.name AS strategy_name, sv.version AS strategy_version,
              s.broker_symbol, s.canonical_symbol,
              ba.id AS broker_account_id, ba.label AS broker_account_label
         FROM positions p
         JOIN bots b ON b.id = p.bot_id
         JOIN strategy_versions sv ON sv.id = b.strategy_version_id
         JOIN broker_symbols s ON s.id = p.broker_symbol_id
         JOIN broker_accounts ba ON ba.id = p.broker_account_id
        WHERE p.id = $1 AND b.user_id = $2`,
      [req.params.id, req.userId],
    );
    if (!posRes.rows[0]) throw Errors.notFound();

    const orders = await query(
      `SELECT id, side, volume, status, broker_ticket, requested_price, filled_price,
              rejection_reason, submitted_at, acknowledged_at, filled_at, created_at
         FROM orders
        WHERE broker_account_id = $1 AND broker_symbol_id = (SELECT broker_symbol_id FROM positions WHERE id=$2)
        ORDER BY created_at ASC`,
      [posRes.rows[0].broker_account_id, req.params.id],
    );

    const decisions = await query(
      `SELECT id, verdict, confidence, reasoning_summary, risk_outcome, risk_reason,
              model_name, model_version, latency_ms, created_at
         FROM ai_decisions
        WHERE bot_id = $1
        ORDER BY created_at DESC LIMIT 20`,
      [posRes.rows[0].bot_id],
    );

    const ledger = await query(
      `SELECT id, event_type, delta, balance_after, reason, created_at
         FROM credit_ledger
        WHERE position_id = $1 AND user_id = $2
        ORDER BY created_at`,
      [req.params.id, req.userId],
    );

    res.json({
      position: posRes.rows[0],
      orders: orders.rows,
      decisions: decisions.rows,
      ledger: ledger.rows,
    });
  } catch (err) { next(err); }
});

historyRouter.get('/export/csv', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT p.id, p.broker_ticket, s.canonical_symbol, p.side, p.volume,
              p.entry_price, p.close_price, p.realized_pl, p.opened_at, p.closed_at,
              b.name AS bot_name, ba.label AS account_label
         FROM positions p
         JOIN bots b ON b.id = p.bot_id
         JOIN broker_symbols s ON s.id = p.broker_symbol_id
         JOIN broker_accounts ba ON ba.id = p.broker_account_id
        WHERE b.user_id = $1 AND p.closed_at IS NOT NULL
        ORDER BY p.closed_at DESC LIMIT 10000`,
      [req.userId],
    );

    const headers = ['id', 'ticket', 'symbol', 'side', 'volume', 'entry', 'close', 'pnl', 'opened', 'closed', 'bot', 'account'];
    const escape = (v: unknown) => {
      const s = String(v ?? '');
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="trade-history.csv"');
    res.write(headers.join(',') + '\n');
    for (const r of rows.rows) {
      res.write([
        r.id, r.broker_ticket, r.canonical_symbol, r.side, r.volume,
        r.entry_price, r.close_price, r.realized_pl, r.opened_at, r.closed_at,
        r.bot_name, r.account_label,
      ].map(escape).join(',') + '\n');
    }
    res.end();
  } catch (err) { next(err); }
});