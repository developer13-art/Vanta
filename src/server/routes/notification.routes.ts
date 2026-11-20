import { Router } from 'express';
import { query } from '../db';
import { requireAuth } from '../middleware';
import { notificationListSchema } from '../schema';
import { Errors } from '../errors';

export const notificationRouter = Router();

notificationRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = notificationListSchema.safeParse(req.query);
    if (!parsed.success) throw Errors.unprocessable('Invalid query', parsed.error.issues);
    const { category, unreadOnly, limit } = parsed.data;

    const conditions: string[] = ['user_id = $1'];
    const params: unknown[] = [req.userId];
    if (category) { params.push(category); conditions.push(`category = $${params.length}`); }
    if (unreadOnly) { conditions.push('read_at IS NULL'); }

    params.push(limit);
    const rows = await query(
      `SELECT id, category, severity, title, body, action_url, read_at, created_at
         FROM notifications WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

notificationRouter.post('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const upd = await query(
      `UPDATE notifications SET read_at = now()
        WHERE id = $1 AND user_id = $2 AND read_at IS NULL RETURNING id`,
      [req.params.id, req.userId],
    );
    if (upd.rows.length === 0) throw Errors.notFound();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

notificationRouter.get('/preferences', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(`SELECT * FROM notification_preferences WHERE user_id=$1`, [req.userId]);
    res.json(rows.rows[0] ?? {});
  } catch (err) { next(err); }
});

notificationRouter.patch('/preferences', requireAuth, async (req, res, next) => {
  try {
    const { email_trading, email_broker, email_wallet } = req.body as Partial<Record<string, boolean>>;
    await query(
      `UPDATE notification_preferences
          SET email_trading = COALESCE($2, email_trading),
              email_broker = COALESCE($3, email_broker),
              email_wallet = COALESCE($4, email_wallet),
              updated_at = now()
        WHERE user_id = $1`,
      [req.userId, email_trading ?? null, email_broker ?? null, email_wallet ?? null],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});