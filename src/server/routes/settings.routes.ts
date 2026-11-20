import { Router } from 'express';
import { query } from '../db';
import { requireAuth, validateBody } from '../middleware';
import { settingsProfileSchema } from '../schema';

export const settingsRouter = Router();

settingsRouter.get('/profile', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, email, full_name, country, email_verified_at, mfa_enabled, created_at
         FROM users WHERE id=$1`,
      [req.userId],
    );
    res.json(rows.rows[0]);
  } catch (err) { next(err); }
});

settingsRouter.patch('/profile', requireAuth, validateBody(settingsProfileSchema), async (req, res, next) => {
  try {
    const { fullName, country } = req.body as typeof settingsProfileSchema._type;
    await query(
      `UPDATE users SET full_name = COALESCE($2, full_name), country = COALESCE($3, country), updated_at = now()
        WHERE id = $1`,
      [req.userId, fullName ?? null, country ?? null],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});