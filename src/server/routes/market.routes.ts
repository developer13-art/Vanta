import { Router } from 'express';
import { query } from '../db';
import { requireAuth } from '../middleware';
import { fetchCandles } from '../metaapi';
import { Errors } from '../errors';

export const marketRouter = Router();

marketRouter.get('/symbols', requireAuth, async (req, res, next) => {
  try {
    const category = (req.query.category as string | undefined) ?? null;
    const params: unknown[] = [req.userId];
    let sql = `
      SELECT s.id, s.broker_symbol, s.canonical_symbol, s.category, s.description, s.digits,
             s.min_volume, s.max_volume, s.volume_step, ba.id AS broker_account_id, ba.label AS broker_account_label
        FROM broker_symbols s
        JOIN broker_accounts ba ON ba.id = s.broker_account_id
       WHERE ba.user_id = $1`;
    if (category) { params.push(category); sql += ` AND s.category = $${params.length}`; }
    sql += ' ORDER BY s.canonical_symbol LIMIT 500';
    const rows = await query(sql, params);
    res.json(rows.rows);
  } catch (err) { next(err); }
});

marketRouter.get('/symbols/:id/candles', requireAuth, async (req, res, next) => {
  try {
    const tf = (req.query.timeframe as string) ?? '15m';
    if (!['1m', '5m', '15m', '1h'].includes(tf)) throw Errors.badRequest('Invalid timeframe');

    const sym = await query<{ metaapi_account_id: string; broker_symbol: string }>(
      `SELECT ba.metaapi_account_id, s.broker_symbol
         FROM broker_symbols s
         JOIN broker_accounts ba ON ba.id = s.broker_account_id
        WHERE s.id = $1 AND ba.user_id = $2`,
      [req.params.id, req.userId],
    );
    if (!sym.rows[0]) throw Errors.notFound();

    const candles = await fetchCandles(
      sym.rows[0].metaapi_account_id,
      sym.rows[0].broker_symbol,
      tf as '1m' | '5m' | '15m' | '1h',
      100,
    );
    res.json({ timeframe: tf, candles });
  } catch (err) { next(err); }
});