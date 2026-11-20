import { Router } from 'express';
import { query } from '../db';
import { Errors } from '../errors';
import { requireAuth, validateBody } from '../middleware';
import { connectBrokerSchema } from '../schema';
import { encrypt, sha256Hex } from '../crypto';
import { provisionAccount, fetchAccountInformation, fetchSymbols } from '../metaapi';
import { enqueue } from '../jobs';
import { logger } from '../logger';

export const brokerRouter = Router();

function canonicalize(symbol: string): { canonical: string; category: string } {
  const s = symbol.toUpperCase().replace(/[._-].*$/, '').replace(/[a-z]/g, '');
  const categories: Record<string, string> = {
    EURUSD: 'forex_major', GBPUSD: 'forex_major', USDJPY: 'forex_major',
    USDCHF: 'forex_major', AUDUSD: 'forex_major', USDCAD: 'forex_major', NZDUSD: 'forex_major',
    EURGBP: 'forex_minor', EURJPY: 'forex_minor', GBPJPY: 'forex_minor',
    XAUUSD: 'metal', XAGUSD: 'metal', GOLD: 'metal', SILVER: 'metal',
    US30: 'index', NAS100: 'index', US500: 'index', GER40: 'index', UK100: 'index', JP225: 'index',
    USOIL: 'energy', UKOIL: 'energy', NATGAS: 'energy',
    BTCUSD: 'crypto_cfd', ETHUSD: 'crypto_cfd', SOLUSD: 'crypto_cfd',
  };
  return { canonical: s, category: categories[s] ?? 'other' };
}

function metaApiErrorFields(error: unknown): { name: string; status?: number; code?: string } {
  if (typeof error !== 'object' || error === null) return { name: 'UnknownError' };
  const providerError = error as { name?: unknown; status?: unknown; code?: unknown };
  return {
    name: typeof providerError.name === 'string' ? providerError.name : 'ProviderError',
    ...(typeof providerError.status === 'number' ? { status: providerError.status } : {}),
    ...(typeof providerError.code === 'string' ? { code: providerError.code } : {}),
  };
}

brokerRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, label, broker_name, server, login, mode, status,
              account_currency, account_balance, account_equity,
              account_free_margin, account_used_margin, account_margin_level,
              account_leverage, is_hedging, trading_enabled,
              last_health_check_at, last_health_status, last_error,
              created_at, updated_at
         FROM broker_accounts WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.userId],
    );
    // Mask login for display
    const masked = rows.rows.map((r) => ({
      ...r,
      login: String(r.login).replace(/.(?=.{3})/g, '*'),
    }));
    res.json(masked);
  } catch (err) { next(err); }
});

brokerRouter.post('/', requireAuth, validateBody(connectBrokerSchema), async (req, res, next) => {
  try {
    const { label, brokerName, server, login, password, mode, platform } = req.body as typeof connectBrokerSchema._type;

    const identityHash = sha256Hex(`${brokerName}:${server}:${login}`);
    const dupe = await query(`SELECT id FROM broker_accounts WHERE user_id=$1 AND identity_hash=$2`, [req.userId, identityHash]);
    if (dupe.rows.length > 0) throw Errors.conflict('This account is already connected');

    let metaapiId: string;
    try {
      metaapiId = await provisionAccount({
        login, password, server,
        name: label,
        platform: platform ?? (/^mt4/i.test(server) ? 'mt4' : 'mt5'),
      });
    } catch (err) {
      const providerError = metaApiErrorFields(err);
      logger.warn(providerError, 'MetaApi provisioning failed');
      if (providerError.status === 400) {
        throw Errors.badRequest('MetaApi rejected the broker details. Check the selected platform, account login, trading password, and exact broker server name.');
      }
      if (providerError.status === 401) {
        throw Errors.unavailable('MetaApi rejected the access token. Verify METAAPI_TOKEN and restart the API server.');
      }
      if (providerError.status === 403) {
        throw Errors.unavailable('MetaApi denied account creation. Check your MetaApi account permissions, plan, and provisioning limits.');
      }
      throw Errors.unavailable('Broker provisioning failed. Check credentials and try again.');
    }

    const encrypted = encrypt(JSON.stringify({ password }));

    const inserted = await query<{ id: string }>(
      `INSERT INTO broker_accounts
         (user_id, label, broker_name, server, login, metaapi_account_id,
          encrypted_credentials, identity_hash, mode, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'connecting') RETURNING id`,
      [req.userId, label, brokerName, server, login, metaapiId, encrypted, identityHash, mode],
    );
    const brokerAccountId = inserted.rows[0].id;

    await enqueue('broker_health_check', { brokerAccountId }, { runAt: new Date(Date.now() + 10_000) });

    res.status(201).json({ id: brokerAccountId, status: 'connecting' });
  } catch (err) { next(err); }
});

brokerRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, label, broker_name, server, login, mode, status,
              account_currency, account_balance, account_equity,
              account_free_margin, account_used_margin, account_margin_level,
              account_leverage, is_hedging, trading_enabled,
              last_health_check_at, last_health_status, last_error, created_at
         FROM broker_accounts WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId],
    );
    if (!rows.rows[0]) throw Errors.notFound();
    res.json(rows.rows[0]);
  } catch (err) { next(err); }
});

brokerRouter.get('/:id/symbols', requireAuth, async (req, res, next) => {
  try {
    const own = await query(`SELECT id FROM broker_accounts WHERE id=$1 AND user_id=$2`, [req.params.id, req.userId]);
    if (!own.rows[0]) throw Errors.notFound();
    const rows = await query(
      `SELECT id, broker_symbol, canonical_symbol, category, description,
              digits, min_volume, max_volume, volume_step, is_tradable
         FROM broker_symbols WHERE broker_account_id = $1 ORDER BY canonical_symbol`,
      [req.params.id],
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

brokerRouter.post('/:id/discover-symbols', requireAuth, async (req, res, next) => {
  try {
    const acc = await query<{ id: string; metaapi_account_id: string }>(
      `SELECT id, metaapi_account_id FROM broker_accounts WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.userId],
    );
    if (!acc.rows[0]) throw Errors.notFound();

    const symbols = await fetchSymbols(acc.rows[0].metaapi_account_id);
    for (const s of symbols) {
      const { canonical, category } = canonicalize(s.symbol);
      await query(
        `INSERT INTO broker_symbols
           (broker_account_id, broker_symbol, canonical_symbol, category, description,
            digits, tick_size, contract_size, min_volume, max_volume, volume_step)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (broker_account_id, broker_symbol) DO UPDATE
           SET description = EXCLUDED.description,
               digits = EXCLUDED.digits,
               min_volume = EXCLUDED.min_volume,
               max_volume = EXCLUDED.max_volume,
               volume_step = EXCLUDED.volume_step,
               updated_at = now()`,
        [
          acc.rows[0].id, s.symbol, canonical, category, s.description,
          s.digits, s.tickSize, s.contractSize, s.minVolume, s.maxVolume, s.volumeStep,
        ],
      );
    }
    res.json({ discovered: symbols.length });
  } catch (err) { next(err); }
});

brokerRouter.post('/:id/refresh-health', requireAuth, async (req, res, next) => {
  try {
    const acc = await query<{ id: string; metaapi_account_id: string }>(
      `SELECT id, metaapi_account_id FROM broker_accounts WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.userId],
    );
    if (!acc.rows[0]) throw Errors.notFound();

    try {
      const info = await fetchAccountInformation(acc.rows[0].metaapi_account_id);
      await query(
        `UPDATE broker_accounts
            SET status='connected', account_currency=$2, account_balance=$3,
                account_equity=$4, account_free_margin=$5, account_used_margin=$6,
                account_margin_level=$7, account_leverage=$8, is_hedging=$9,
                last_health_check_at=now(), last_health_status='ok', last_error=NULL,
                updated_at=now()
          WHERE id=$1`,
        [
          acc.rows[0].id, info.currency, info.balance, info.equity,
          info.freeMargin, info.usedMargin, info.marginLevel, info.leverage, info.isHedging,
        ],
      );
      res.json({ status: 'connected', ...info });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'health check failed';
      await query(
        `UPDATE broker_accounts
            SET status='requires_attention', last_health_check_at=now(),
                last_health_status='error', last_error=$2, updated_at=now()
          WHERE id=$1`,
        [acc.rows[0].id, msg.slice(0, 500)],
      );
      throw Errors.unavailable('Broker health check failed');
    }
  } catch (err) { next(err); }
});

brokerRouter.post('/:id/authorize-live', requireAuth, async (req, res, next) => {
  try {
    const { confirmPhrase } = req.body as { confirmPhrase?: string };
    if (confirmPhrase !== 'AUTHORIZE LIVE TRADING') throw Errors.badRequest('Confirmation phrase required');
    const upd = await query(
      `UPDATE broker_accounts
          SET trading_enabled = true, live_authorized_at = now(), updated_at = now()
        WHERE id = $1 AND user_id = $2 AND mode = 'live'
        RETURNING id`,
      [req.params.id, req.userId],
    );
    if (upd.rows.length === 0) throw Errors.badRequest('Account not found or not live');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

brokerRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const del = await query(
      `DELETE FROM broker_accounts WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.userId],
    );
    if (del.rows.length === 0) throw Errors.notFound();
    res.status(204).end();
  } catch (err) { next(err); }
});