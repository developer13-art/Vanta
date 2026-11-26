import { Router } from 'express';
import { query } from '../db';
import { requireAuth } from '../middleware';

export const analyticsRouter = Router();

export function parseAnalyticsPeriod(value: unknown): number | 'all' {
  const requested = String(value ?? '');
  if (requested.toLowerCase() === 'all') return 'all';
  return Math.min(365, Math.max(1, Number(requested) || 30));
}

analyticsRouter.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const days = parseAnalyticsPeriod(req.query.days);
    const userParam = days === 'all' ? 1 : 2;
    const params = days === 'all' ? [req.userId] : [days, req.userId];
    const dateFilter = days === 'all' ? '' : `AND p.closed_at >= now() - ($1::int || ' days')::interval`;

    const pnl = await query<{
      realized: string; wins: string; losses: string; total: string;
      avg_win: string; avg_loss: string; largest_win: string; largest_loss: string;
    }>(
      `SELECT
         COALESCE(SUM(realized_pl), 0) AS realized,
         count(*) FILTER (WHERE realized_pl > 0) AS wins,
         count(*) FILTER (WHERE realized_pl < 0) AS losses,
         count(*) AS total,
         COALESCE(AVG(realized_pl) FILTER (WHERE realized_pl > 0), 0) AS avg_win,
         COALESCE(AVG(realized_pl) FILTER (WHERE realized_pl < 0), 0) AS avg_loss,
         COALESCE(MAX(realized_pl), 0) AS largest_win,
         COALESCE(MIN(realized_pl), 0) AS largest_loss
       FROM positions p
       JOIN bots b ON b.id = p.bot_id
      WHERE b.user_id = $${userParam} AND p.closed_at IS NOT NULL
        AND (p.source = 'platform' OR p.opening_order_id IS NOT NULL)
        ${dateFilter}`,
      params,
    );

    const creditDateFilter = days === 'all' ? '' : `AND created_at >= now() - ($1::int || ' days')::interval`;
    const credits = await query<{ spent: string }>(
      `SELECT COALESCE(SUM(-delta), 0) AS spent
         FROM credit_ledger
        WHERE user_id = $${userParam} AND delta < 0 ${creditDateFilter}`,
      params,
    );

    res.json({ days, pnl: pnl.rows[0], creditsUsed: Number(credits.rows[0]?.spent ?? 0) });
  } catch (err) { next(err); }
});

analyticsRouter.get('/daily-pnl', requireAuth, async (req, res, next) => {
  try {
    const days = parseAnalyticsPeriod(req.query.days);
    const userParam = days === 'all' ? 1 : 2;
    const params = days === 'all' ? [req.userId] : [days, req.userId];
    const dateFilter = days === 'all' ? '' : `AND p.closed_at >= now() - ($1::int || ' days')::interval`;
    const dateGrouping = days === 'all' ? "date_trunc('month', p.closed_at)" : "date_trunc('day', p.closed_at)";
    const rows = await query(
      `SELECT ${dateGrouping} AS day,
              COALESCE(SUM(p.realized_pl), 0) AS pnl,
              count(*)::int AS trades
         FROM positions p JOIN bots b ON b.id = p.bot_id
        WHERE b.user_id = $${userParam} AND p.closed_at IS NOT NULL
          AND (p.source = 'platform' OR p.opening_order_id IS NOT NULL)
          ${dateFilter}
        GROUP BY 1 ORDER BY 1`,
      params,
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});