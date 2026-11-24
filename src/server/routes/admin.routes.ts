import { Router } from 'express';
import { query } from '../db';
import { requireAuth, requireAdmin } from '../middleware';
import { Errors } from '../errors';
import { enqueue } from '../jobs';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/overview', async (_req, res, next) => {
  try {
    const [users, accounts, bots, ledger] = await Promise.all([
      query<{ total: string; active: string }>(
        `SELECT count(*) AS total, count(*) FILTER (WHERE status='active') AS active FROM users`,
      ),
      query<{ total: string; connected: string; live: string }>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE status='connected') AS connected,
                count(*) FILTER (WHERE mode='live') AS live
           FROM broker_accounts`,
      ),
      query<{ total: string; running: string }>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE state='running') AS running FROM bots`,
      ),
      query<{ credits_sold: string; credits_used: string }>(
        `SELECT
           COALESCE(SUM(delta) FILTER (WHERE event_type='purchase'), 0) AS credits_sold,
           COALESCE(-SUM(delta) FILTER (WHERE delta < 0), 0) AS credits_used
         FROM credit_ledger`,
      ),
    ]);
    res.json({
      users: users.rows[0],
      accounts: accounts.rows[0],
      bots: bots.rows[0],
      credits: ledger.rows[0],
    });
  } catch (err) { next(err); }
});

adminRouter.get('/users', async (req, res, next) => {
  try {
    const search = (req.query.q as string | undefined) ?? '';
    const rows = await query(
      `SELECT u.id, u.email, u.full_name, u.country, u.status, u.created_at,
              u.email_verified_at,
              (SELECT count(*)::int FROM broker_accounts ba WHERE ba.user_id = u.id) AS account_count,
              (SELECT count(*)::int FROM bots b WHERE b.user_id = u.id) AS bot_count,
              (SELECT available_credits FROM wallets w WHERE w.user_id = u.id) AS credits
         FROM users u
        WHERE ($1 = '' OR u.email ILIKE '%'||$1||'%' OR u.full_name ILIKE '%'||$1||'%')
        ORDER BY u.created_at DESC LIMIT 200`,
      [search],
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

adminRouter.post('/users/:id/suspend', async (req, res, next) => {
  try {
    await query(`UPDATE users SET status='suspended', updated_at=now() WHERE id=$1`, [req.params.id]);
    await query(
      `INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id)
       VALUES ($1,'admin','user.suspend','user',$2)`,
      [req.userId, req.params.id],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

adminRouter.post('/users/:id/reactivate', async (req, res, next) => {
  try {
    await query(`UPDATE users SET status='active', updated_at=now() WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

adminRouter.post('/emergency/halt', async (req, res, next) => {
  try {
    const { scope, scopeId, action, reason } = req.body as {
      scope?: 'global' | 'symbol' | 'strategy' | 'user' | 'account' | 'broker';
      scopeId?: string | null;
      action?: 'halt_new_entries' | 'halt_all' | 'close_all';
      reason?: string;
    };
    if (!scope || !action || !reason) throw Errors.badRequest('scope, action, reason required');

    await query(
      `INSERT INTO emergency_controls (scope, scope_id, action, reason, activated_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [scope, scopeId ?? null, action, reason, req.userId],
    );

    if (scope === 'global' || (scope === 'user' && scopeId)) {
      const where = scope === 'global' ? '' : ` AND user_id = $1`;
      const params = scope === 'global' ? [] : [scopeId];
      await query(`UPDATE bots SET state='paused', updated_at=now() WHERE state='running'${where}`, params);
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

adminRouter.get('/audit', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, actor_id, actor_type, action, target_type, target_id, metadata, created_at
         FROM audit_log ORDER BY created_at DESC LIMIT 200`,
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

adminRouter.get('/jobs', async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT status, count(*)::int AS count FROM jobs GROUP BY status`,
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

// Admin can requeue a specific failed job
adminRouter.post('/jobs/:id/requeue', async (req, res, next) => {
  try {
    await query(
      `UPDATE jobs SET status='pending', run_at=now(), attempts=0 WHERE id=$1 AND status='failed'`,
      [req.params.id],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});


adminRouter.get('/broker-accounts', async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, user_id, label, broker_name, server, login, mode, status,
              connection_provider, platform, provider_account_id,
              last_health_status, last_error, created_at
         FROM broker_accounts ORDER BY created_at DESC LIMIT 500`,
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

adminRouter.get('/bots', async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT b.id, b.user_id, b.name, b.state, b.broker_account_id,
              ba.label AS broker_account_label, b.last_run_at, b.created_at,
              (SELECT count(*)::int FROM positions p WHERE p.bot_id = b.id AND p.closed_at IS NULL) AS open_positions
         FROM bots b JOIN broker_accounts ba ON ba.id = b.broker_account_id
        ORDER BY b.created_at DESC LIMIT 500`,
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

adminRouter.post('/bots/:id/pause', async (req, res, next) => {
  try {
    await query(`UPDATE bots SET state='paused', updated_at=now() WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

adminRouter.get('/orders', async (req, res, next) => {
  try {
    const status = (req.query.status as string) ?? null;
    const params: unknown[] = [];
    let sql = `SELECT id, bot_id, broker_account_id, side, volume, status,
                      broker_ticket, rejection_reason, created_at, acknowledged_at
                 FROM orders`;
    if (status) { params.push(status); sql += ` WHERE status = $1`; }
    sql += ' ORDER BY created_at DESC LIMIT 500';
    const rows = await query(sql, params);
    res.json(rows.rows);
  } catch (err) { next(err); }
});

adminRouter.post('/orders/:id/reconcile', async (req, res, next) => {
  try {
    const { reconcileOrder } = await import('../reconciliation');
    await reconcileOrder(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

adminRouter.get('/credits', async (_req, res, next) => {
  try {
    const totals = await query(
      `SELECT event_type, SUM(delta)::int AS total, count(*)::int AS count
         FROM credit_ledger GROUP BY event_type ORDER BY event_type`,
    );
    const recent = await query(
      `SELECT id, user_id, delta, balance_after, event_type, reason, created_at
         FROM credit_ledger ORDER BY created_at DESC LIMIT 200`,
    );
    res.json({ totals: totals.rows, recent: recent.rows });
  } catch (err) { next(err); }
});

adminRouter.get('/payments', async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, user_id, provider, provider_reference, package_code, credits_granted,
              amount, currency, status, paid_at, created_at
         FROM payments ORDER BY created_at DESC LIMIT 500`,
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

adminRouter.get('/ai-strategies', async (_req, res, next) => {
  try {
    const strategies = await query(
      `SELECT id, name, version, is_active, eligible_categories, created_at
         FROM strategy_versions ORDER BY name, version DESC`,
    );
    const recent = await query(
      `SELECT id, bot_id, verdict, confidence, risk_outcome, rejected_by_validator, created_at
         FROM ai_decisions ORDER BY created_at DESC LIMIT 200`,
    );
    res.json({ strategies: strategies.rows, recent_decisions: recent.rows });
  } catch (err) { next(err); }
});

adminRouter.get('/market-data', async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT ba.id, ba.label, ba.broker_name, ba.status,
              ba.last_health_check_at, ba.last_health_status,
              (SELECT count(*)::int FROM broker_symbols bs WHERE bs.broker_account_id = ba.id) AS symbol_count
         FROM broker_accounts ba ORDER BY ba.created_at DESC LIMIT 200`,
    );
    res.json({ broker_accounts: rows.rows });
  } catch (err) { next(err); }
});

adminRouter.get('/risk-controls', async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT limit_key, limit_value FROM risk_limits WHERE scope='platform' ORDER BY limit_key`,
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

adminRouter.post('/risk-controls', async (req, res, next) => {
  try {
    const { key, value } = req.body as { key?: string; value?: number };
    if (!key || typeof value !== 'number') throw Errors.badRequest('key and value required');
    await query(
      `INSERT INTO risk_limits (scope, scope_id, limit_key, limit_value)
       VALUES ('platform', NULL, $1, $2)
       ON CONFLICT (scope, scope_id, limit_key) DO UPDATE SET limit_value=EXCLUDED.limit_value, updated_at=now()`,
      [key, value],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

adminRouter.get('/infrastructure', async (_req, res, next) => {
  try {
    const dbCheck = await healthCheck();
    const jobs = await query(`SELECT status, count(*)::int AS count FROM jobs GROUP BY status`);
    res.json({
      db_ok: dbCheck,
      jobs: jobs.rows,
      uptime_seconds: process.uptime(),
      memory_mb: process.memoryUsage().rss / 1024 / 1024,
    });
  } catch (err) { next(err); }
});

adminRouter.get('/login-events', async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, user_id, ip_address, success, reason, created_at
         FROM login_events ORDER BY created_at DESC LIMIT 500`,
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});