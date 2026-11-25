import { Router } from 'express';
import { query, withTransaction } from '../db';
import { Errors } from '../errors';
import { requireAuth, validateBody } from '../middleware';
import { createBotSchema, updateBotSchema, closePositionsSchema, closeAllSchema } from '../schema';
import { closePosition } from '../execution';
import { deleteBotForUser } from '../bot-deletion';
import { updateBotConfiguration } from '../bot-configuration';

export const botRouter = Router();

botRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT b.id, b.name, b.state, b.is_live, b.lot_size, b.entry_batch_size,
              b.max_concurrent_positions, b.daily_loss_limit, b.drawdown_limit,
              b.margin_utilization_limit, b.max_spread_points, b.cooldown_seconds,
              b.stop_behavior, b.started_at, b.stopped_at, b.last_run_at,
              latest.verdict AS last_decision_verdict,
              latest.reasoning_summary AS last_decision_summary,
              latest.created_at AS last_decision_at,
              b.created_at, b.updated_at,
              sv.name AS strategy_name, sv.version AS strategy_version,
              ba.label AS broker_account_label, ba.mode AS broker_mode,
              (SELECT count(*)::int FROM positions p WHERE p.bot_id = b.id AND p.closed_at IS NULL) AS open_positions,
              (SELECT count(*)::int FROM bot_instruments bi WHERE bi.bot_id = b.id) AS instrument_count
         FROM bots b
         JOIN strategy_versions sv ON sv.id = b.strategy_version_id
         JOIN broker_accounts ba ON ba.id = b.broker_account_id
         LEFT JOIN LATERAL (
           SELECT verdict, reasoning_summary, created_at
             FROM ai_decisions WHERE bot_id = b.id
            ORDER BY created_at DESC LIMIT 1
         ) latest ON TRUE
        WHERE b.user_id = $1
        ORDER BY b.created_at DESC`,
      [req.userId],
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});

botRouter.post('/', requireAuth, validateBody(createBotSchema), async (req, res, next) => {
  try {
    const body = req.body as typeof createBotSchema._type;

    if (body.strategyName !== 'ai_adaptive') {
      throw Errors.badRequest('Bots use AI Adaptive analysis instead of a fixed strategy.');
    }

    const account = await query<{ id: string; mode: string; trading_enabled: boolean }>(
      `SELECT id, mode, trading_enabled FROM broker_accounts WHERE id=$1 AND user_id=$2`,
      [body.brokerAccountId, req.userId],
    );
    if (!account.rows[0]) throw Errors.notFound('Broker account not found');
    if (account.rows[0].mode === 'live' && !account.rows[0].trading_enabled)
      throw Errors.forbidden('Live trading not authorized for this account');

    // Confirm all selected symbols belong to the account
    const symbols = await query<{ id: string }>(
      `SELECT id FROM broker_symbols
        WHERE id = ANY($1::uuid[]) AND broker_account_id = $2`,
      [body.brokerSymbolIds, body.brokerAccountId],
    );
    if (symbols.rows.length !== body.brokerSymbolIds.length)
      throw Errors.badRequest('One or more instruments do not belong to this account');

    const strategyRes = await query<{ id: string }>(
      `SELECT id FROM strategy_versions WHERE name=$1 AND is_active=true
        ORDER BY version DESC LIMIT 1`,
      [body.strategyName],
    );
    if (!strategyRes.rows[0]) throw Errors.badRequest('Strategy version not registered');

    const bot = await withTransaction(async (client) => {
      const b = await client.query<{ id: string }>(
        `INSERT INTO bots
           (user_id, broker_account_id, name, strategy_version_id, strategy_params,
            lot_size, entry_batch_size, max_concurrent_positions,
            daily_loss_limit, drawdown_limit, margin_utilization_limit,
            max_spread_points, cooldown_seconds, stop_behavior, is_live, state)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'ready')
         RETURNING id`,
        [
          req.userId, body.brokerAccountId, body.name, strategyRes.rows[0].id,
          JSON.stringify(body.strategyParams), body.lotSize, body.entryBatchSize,
          body.maxConcurrentPositions, body.dailyLossLimit, body.drawdownLimit,
          body.marginUtilizationLimit, body.maxSpreadPoints ?? null,
          body.cooldownSeconds, body.stopBehavior, account.rows[0].mode === 'live',
        ],
      );
      const botId = b.rows[0].id;
      for (const symbolId of body.brokerSymbolIds) {
        await client.query(
          `INSERT INTO bot_instruments (bot_id, broker_symbol_id) VALUES ($1,$2)`,
          [botId, symbolId],
        );
      }
      return botId;
    });

    res.status(201).json({ id: bot });
  } catch (err) { next(err); }
});

botRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const bot = await query(
      `SELECT b.*, sv.name AS strategy_name, sv.version AS strategy_version,
              ba.label AS broker_account_label, ba.mode AS broker_mode
         FROM bots b
         JOIN strategy_versions sv ON sv.id = b.strategy_version_id
         JOIN broker_accounts ba ON ba.id = b.broker_account_id
        WHERE b.id = $1 AND b.user_id = $2`,
      [req.params.id, req.userId],
    );
    if (!bot.rows[0]) throw Errors.notFound();

    const [instruments, positions, decisions] = await Promise.all([
      query(
        `SELECT s.id, s.broker_symbol, s.canonical_symbol, s.category
           FROM bot_instruments bi
           JOIN broker_symbols s ON s.id = bi.broker_symbol_id
          WHERE bi.bot_id = $1`,
        [req.params.id],
      ),
      query(
        `SELECT id, broker_ticket, side, volume, entry_price, current_price, floating_pl,
                opened_at, management_state, source
           FROM positions WHERE bot_id = $1 AND closed_at IS NULL
          ORDER BY opened_at DESC`,
        [req.params.id],
      ),
      query(
        `SELECT id, verdict, confidence, reasoning_summary, risk_outcome, risk_reason, created_at
           FROM ai_decisions WHERE bot_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.params.id],
      ),
    ]);

    res.json({
      bot: bot.rows[0],
      instruments: instruments.rows,
      openPositions: positions.rows,
      recentDecisions: decisions.rows,
    });
  } catch (err) { next(err); }
});

botRouter.put('/:id', requireAuth, validateBody(updateBotSchema), async (req, res, next) => {
  try {
    const botId = req.params.id;
    if (!botId) throw Errors.notFound();
    await updateBotConfiguration(
      botId,
      req.userId!,
      req.body as typeof updateBotSchema._type,
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

botRouter.post('/:id/start', requireAuth, async (req, res, next) => {
  try {
    const started = await withTransaction(async (client) => {
      const upd = await client.query(
        `UPDATE bots SET state='running', started_at=COALESCE(started_at, now()), stopped_at=NULL, updated_at=now()
          WHERE id=$1 AND user_id=$2 AND state IN ('ready','paused','stopped','management_only')
          RETURNING id`,
        [req.params.id, req.userId],
      );
      if (upd.rows.length === 0) return false;
      await client.query(
        `INSERT INTO jobs (type, payload, run_at)
         VALUES ('tick_analysis', jsonb_build_object('botId', $1::text), now())
         ON CONFLICT DO NOTHING`,
        [req.params.id],
      );
      return true;
    });
    if (!started) throw Errors.conflict('Bot cannot be started from its current state');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

botRouter.post('/:id/pause', requireAuth, async (req, res, next) => {
  try {
    const upd = await query(
      `UPDATE bots SET state='paused', updated_at=now()
        WHERE id=$1 AND user_id=$2 AND state='running' RETURNING id`,
      [req.params.id, req.userId],
    );
    if (upd.rows.length === 0) throw Errors.conflict('Bot is not running');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

botRouter.post('/:id/stop', requireAuth, async (req, res, next) => {
  try {
    const { action } = req.body as { action?: 'stop_new_manage_existing' | 'close_all_and_stop' };
    const mode = action === 'close_all_and_stop' ? 'close_all_and_stop' : 'stop_new_manage_existing';

    if (mode === 'close_all_and_stop') {
      const positions = await query<{ id: string }>(
        `SELECT p.id FROM positions p JOIN bots b ON b.id = p.bot_id
          WHERE b.id = $1 AND b.user_id = $2 AND p.closed_at IS NULL`,
        [req.params.id, req.userId],
      );
      for (const p of positions.rows) {
        try { await closePosition({ userId: req.userId!, positionId: p.id }); }
        catch { /* continue closing the rest */ }
      }
      await query(`UPDATE bots SET state='stopped', stopped_at=now(), updated_at=now() WHERE id=$1 AND user_id=$2`,
        [req.params.id, req.userId]);
    } else {
      await query(`UPDATE bots SET state='management_only', updated_at=now() WHERE id=$1 AND user_id=$2`,
        [req.params.id, req.userId]);
    }
    res.json({ ok: true, mode });
  } catch (err) { next(err); }
});

botRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await deleteBotForUser(req.params.id, req.userId!);
    res.status(204).end();
  } catch (err) { next(err); }
});

// Positions
botRouter.post('/positions/close', requireAuth, validateBody(closePositionsSchema), async (req, res, next) => {
  try {
    const { positionIds } = req.body as typeof closePositionsSchema._type;
    const results = await Promise.allSettled(positionIds.map((id) => closePosition({ userId: req.userId!, positionId: id })));
    res.json({
      results: results.map((r, i) => ({
        positionId: positionIds[i],
        ok: r.status === 'fulfilled',
        error: r.status === 'rejected' ? String((r.reason as Error)?.message ?? r.reason) : undefined,
      })),
    });
  } catch (err) { next(err); }
});

botRouter.post('/positions/close-all', requireAuth, validateBody(closeAllSchema), async (req, res, next) => {
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

botRouter.get('/positions/open', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT p.id, p.broker_ticket, p.side, p.volume, p.entry_price, p.current_price,
              p.floating_pl, p.opened_at, p.management_state, p.source,
              b.id AS bot_id, b.name AS bot_name,
              s.broker_symbol, s.canonical_symbol,
              ba.id AS broker_account_id, ba.label AS broker_account_label
         FROM positions p
         JOIN bots b ON b.id = p.bot_id
         JOIN broker_symbols s ON s.id = p.broker_symbol_id
         JOIN broker_accounts ba ON ba.id = p.broker_account_id
        WHERE b.user_id = $1 AND p.closed_at IS NULL
        ORDER BY p.opened_at DESC`,
      [req.userId],
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});