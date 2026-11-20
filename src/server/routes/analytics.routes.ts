import { Router } from 'express';
import { query } from '../db';
import { requireAuth } from '../middleware';

export const analyticsRouter = Router();

analyticsRouter.get('/summary', requireAuth, async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = `now() - ($1::int || ' days')::interval`;

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
      WHERE b.user_id = $2 AND p.closed_at IS NOT NULL
        AND p.closed_at >= ${since}`,
      [days, req.userId],
    );

    const credits = await query<{ spent: string }>(
      `SELECT COALESCE(SUM(-delta), 0) AS spent
         FROM credit_ledger
        WHERE user_id = $2 AND delta < 0 AND created_at >= ${since}`,
      [days, req.userId],
    );

    res.json({ days, pnl: pnl.rows[0], creditsUsed: Number(credits.rows[0].spent) });
  } catch (err) { next(err); }
});

analyticsRouter.get('/daily-pnl', requireAuth, async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const rows = await query(
      `SELECT date_trunc('day', p.closed_at) AS day,
              COALESCE(SUM(p.realized_pl), 0) AS pnl,
              count(*)::int AS trades
         FROM positions p JOIN bots b ON b.id = p.bot_id
        WHERE b.user_id = $2 AND p.closed_at IS NOT NULL
          AND p.closed_at >= now() - ($1::int || ' days')::interval
        GROUP BY 1 ORDER BY 1`,
      [days, req.userId],
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});