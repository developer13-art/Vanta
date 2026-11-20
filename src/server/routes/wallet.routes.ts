import { Router } from 'express';
import { query } from '../db';
import { requireAuth, validateBody } from '../middleware';
import { getWallet, listLedger } from '../ledger';
import { PACKAGES } from '../credit-rates';
import { purchaseSchema } from '../schema';
import { initPayment } from '../paystack';
import { Errors } from '../errors';

export const walletRouter = Router();

walletRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const w = await getWallet(req.userId!);
    res.json(w);
  } catch (err) { next(err); }
});

walletRouter.get('/ledger', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const rows = await listLedger(req.userId!, limit, offset);
    res.json(rows);
  } catch (err) { next(err); }
});

walletRouter.get('/packages', (_req, res) => {
  res.json(
    Object.entries(PACKAGES).map(([code, pkg]) => ({
      code,
      credits: pkg.credits,
      priceUsd: pkg.price,
      priceNgn: pkg.priceNgn,
    })),
  );
});

walletRouter.post('/purchase', requireAuth, validateBody(purchaseSchema), async (req, res, next) => {
  try {
    const { packageCode } = req.body as typeof purchaseSchema._type;
    const userRes = await query<{ email: string }>(`SELECT email FROM users WHERE id=$1`, [req.userId]);
    if (!userRes.rows[0]) throw Errors.notFound();
    const result = await initPayment({
      userId: req.userId!,
      email: userRes.rows[0].email,
      packageCode,
    });
    res.json(result);
  } catch (err) { next(err); }
});

walletRouter.get('/payments', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, provider, provider_reference, package_code, credits_granted,
              amount, currency, status, paid_at, created_at
         FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.userId],
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});