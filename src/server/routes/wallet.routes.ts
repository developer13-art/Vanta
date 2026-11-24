import { Router } from 'express';
import { query } from '../db';
import { requireAuth, validateBody } from '../middleware';
import { getWallet, listLedger } from '../ledger';
import { PACKAGES } from '../credit-rates';
import { purchaseSchema, verifyPaymentSchema } from '../schema';
import { getPaymentOptions, listPackagesForCurrency, startPayment, verifyPaymentForUser } from '../payments';
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

walletRouter.get('/packages', async (req, res, next) => {
  try {
    if (typeof req.query.currency !== 'string') {
      res.json(Object.entries(PACKAGES).map(([code, pkg]) => ({
        code,
        credits: pkg.credits,
        priceUsd: pkg.price,
        priceNgn: pkg.priceNgn,
        amount: pkg.priceNgn,
        currency: 'NGN',
      })));
      return;
    }
    res.json(await listPackagesForCurrency(req.query.currency.toUpperCase()));
  } catch (err) { next(err); }
});

walletRouter.get('/payment-options', requireAuth, async (_req, res, next) => {
  try {
    res.json(await getPaymentOptions());
  } catch (err) { next(err); }
});

walletRouter.post('/purchase', requireAuth, validateBody(purchaseSchema), async (req, res, next) => {
  try {
    const { packageCode, provider, method, currency } = req.body as typeof purchaseSchema._type;
    const userRes = await query<{ email: string }>(`SELECT email FROM users WHERE id=$1`, [req.userId]);
    if (!userRes.rows[0]) throw Errors.notFound();
    const result = await startPayment({
      userId: req.userId!,
      email: userRes.rows[0].email,
      packageCode,
      provider,
      method,
      currency,
    });
    res.json(result);
  } catch (err) { next(err); }
});

walletRouter.post('/verify-payment', requireAuth, validateBody(verifyPaymentSchema), async (req, res, next) => {
  try {
    const { reference, transactionId } = req.body as typeof verifyPaymentSchema._type;
    const result = await verifyPaymentForUser(reference, req.userId!, transactionId);
    res.json(result);
  } catch (err) { next(err); }
});

walletRouter.get('/payments', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, provider, provider_reference, provider_transaction_id, package_code, credits_granted,
              amount, currency, status, paid_at, created_at
         FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.userId],
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});