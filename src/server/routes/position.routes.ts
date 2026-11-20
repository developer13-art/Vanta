import { Router } from 'express';
import { query } from '../db';
import { requireAuth, validateBody } from '../middleware';
import { closePositionsSchema, closeAllSchema } from '../schema';
import { closePosition } from '../execution';
import { Errors } from '../errors';

export const positionRouter = Router();

positionRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { brokerAccountId, botId, direction, profitable, symbolId } = req.query as Record<string, string | undefined>;
    const conditions: string[] = ['b.user_id = $1', 'p.closed_at IS NULL'];
    const params: unknown[] = [req.userId];

    if (brokerAccountId) { params.push(brokerAccountId); conditions.push(`p.broker_account_id = $${params.length}`); }
    if (botId) { params.push(botId); conditions.push(`p.bot_id = $${params.length}`); }
    if (direction === 'buy' || direction === 'sell') { params.push(direction); conditions.push(`p.side = $${params.length}`); }
    if (profitable === 'true') { conditions.push('p.floating_pl > 0'); }
    if (profitble === 'false') { conditions.push('p.floating_pl < 0'); }
    if (symbolId) { params.push(symbolId); conditions.push(`p.broker_symbol_id = $${params.length}`); }

    const rows = await query(
      `SELECT p.id, p.broker_ticket, p.side, p.volume, p.entry_price, p.current_price,
              p.floating_pl, p.commission, p.swap, p.opened_at, p.management_state, p.source,
              b.id AS bot_id, b.name AS bot_name,
              s.broker_symbol, s.canonical_symbol, s.digits,
              ba.id AS broker_account_id, ba.label AS broker_account_label, ba.mode
         FROM positions p
         JOIN bots b ON b.id = p.bot_id
         JOIN broker_symbols s ON s.id = p.broker_symbol_id
         JOIN broker_accounts ba ON ba.id = p.broker_account_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.opened_at DESC
        LIMIT 500`,
      params,
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

positionRouter.post('/:id/close', requireAuth, async (req, res, next) => {
  try {
    await closePosition({ userId: req.userId!, positionId: req.params.id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

positionRouter.post('/close-selected', requireAuth, validateBody(closePositionsSchema), async (req, res, next) => {
  try {
    const { positionIds } = req.body as typeof closePositionsSchema._type;
    const results = await Promise.allSettled(
      positionIds.map((id) => closePosition({ userId: req.userId!, positionId: id })),
    );
    res.json({
      results: results.map((r, i) => ({
        positionId: positionIds[i],
        ok: r.status === 'fulfilled',
        error: r.status === 'rejected' ? String((r.reason as Error)?.message ?? r.reason) : undefined,
      })),
    });
  } catch (err) { next(err); }
});

positionRouter.post('/close-all', requireAuth, validateBody(closeAllSchema), async (req, res, next) => {
  try {
    const { brokerAccountId } = req.body as typeof closeAllSchema._type;
    const own = await query(`SELECT id FROM broker_accounts WHERE id=$1 AND user_id=$2`, [brokerAccountId, req.userId]);
    if (!own.rows[0]) throw Errors.notFound();
    const positions = await query<{ id: string }>(
      `SELECT id FROM positions WHERE broker_account_id=$1 AND closed_at IS NULL`,
      [brokerAccountId],
    );
    const results = await Promise.allSettled(positions.rows.map((p) => closePosition({ userId: req.userId!, positionId: p.id })));
    res.json({
      total: positions.rows.length,
      succeeded: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    });
  } catch (err) { next(err); }
});