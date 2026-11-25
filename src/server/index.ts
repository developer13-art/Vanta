import { env } from './env';
import { buildApp } from './app';
import { logger } from './logger';
import { pool, closePool } from './db';
import { startScheduler, stopScheduler, registerHandler, recoverStaleJobs, enqueue } from './jobs';
import { reconcileBrokerAccount, reconcileOrder } from './reconciliation';
import { getBrokerHealth } from './broker-providers';
import { query } from './db';
import { checkLowBalance, createNotification } from './notifications';
import { runBotTick } from './bot-engine';
import { manageProfitablePositions } from './position-manager';

// Register job handlers
registerHandler('reconciliation', async (payload) => {
  if (typeof payload.orderId === 'string') return reconcileOrder(payload.orderId);
  if (typeof payload.brokerAccountId === 'string') return reconcileBrokerAccount(payload.brokerAccountId);
});

registerHandler('broker_health_check', async (payload) => {
  const brokerAccountId = String(payload.brokerAccountId);
  const attempt = typeof payload.attempt === 'number' && Number.isInteger(payload.attempt)
    ? payload.attempt
    : 0;
  const acc = await query<{
    id: string; connection_provider: 'metaapi' | 'fxapis'; provider_account_id: string; user_id: string;
  }>(
    `SELECT id, connection_provider, provider_account_id, user_id FROM broker_accounts WHERE id=$1`,
    [brokerAccountId],
  );
  const account = acc.rows[0];
  if (!account) return;

  try {
    const health = await getBrokerHealth(account.connection_provider, account.provider_account_id);
    if (health.status !== 'connected' || !health.info) {
      await query(
        `UPDATE broker_accounts
            SET status=$2, last_health_check_at=now(), last_health_status=$2,
                last_error=$3, updated_at=now()
          WHERE id=$1`,
        [brokerAccountId, health.status, health.status === 'requires_attention' ? health.detail : null],
      );
      if ((health.status === 'connecting' || health.status === 'reconnecting') && attempt < 8) {
        await enqueue(
          'broker_health_check',
          { brokerAccountId, attempt: attempt + 1 },
          { runAt: new Date(Date.now() + 15_000) },
        );
      }
      if (health.status === 'requires_attention') {
        await createNotification({
          userId: account.user_id, category: 'broker', severity: 'warning',
          title: 'Broker connection issue', body: 'Your broker account needs attention. Check the connection details and broker status.',
        });
      }
      return;
    }
    const info = health.info;
    await query(
      `UPDATE broker_accounts
          SET status='connected', account_currency=$2, account_balance=$3,
              account_equity=$4, account_free_margin=$5, account_used_margin=$6,
              account_margin_level=$7, account_leverage=$8, is_hedging=$9,
              last_health_check_at=now(), last_health_status='ok', last_error=NULL, updated_at=now()
        WHERE id=$1`,
      [
        brokerAccountId, info.currency, info.balance, info.equity,
        info.freeMargin, info.usedMargin, info.marginLevel, info.leverage, info.isHedging,
      ],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'health check failed';
    await query(
      `UPDATE broker_accounts
          SET status='requires_attention', last_health_check_at=now(),
              last_health_status='error', last_error=$2, updated_at=now()
        WHERE id=$1`,
      [brokerAccountId, msg.slice(0, 500)],
    );
    await createNotification({
      userId: account.user_id, category: 'broker', severity: 'warning',
      title: 'Broker connection issue', body: 'Your broker account health check failed. Reconnect or check credentials.',
    });
  }
});

registerHandler('position_check', async (payload) => {
  const orderId = String(payload.orderId);
  const pos = await query<{ broker_account_id: string }>(
    `SELECT broker_account_id FROM orders WHERE id=$1`, [orderId],
  );
  if (pos.rows[0]) await reconcileBrokerAccount(pos.rows[0].broker_account_id);
});

registerHandler('reservation_expiry', async () => {
  await query(
    `UPDATE credit_reservations SET status='expired'
      WHERE status='reserved' AND expires_at < now()`,
  );
});

registerHandler('notification_dispatch', async (payload) => {
  if (typeof payload.userId === 'string' && typeof payload.title === 'string') {
    await createNotification({
      userId: payload.userId,
      category: (payload.category as 'trading' | 'broker' | 'wallet' | 'security' | 'system') ?? 'system',
      severity: (payload.severity as 'info' | 'warning' | 'critical') ?? 'info',
      title: payload.title,
      body: String(payload.body ?? ''),
    });
  }
});

registerHandler('tick_analysis', async (payload) => {
  if (typeof payload.botId !== 'string') throw new Error('Tick job is missing its bot ID.');
  await runBotTick(payload.botId);
});

registerHandler('position_management', async (payload) => {
  if (typeof payload.brokerAccountId !== 'string') {
    throw new Error('Position management job is missing its broker account ID.');
  }
  await manageProfitablePositions(payload.brokerAccountId);
});

async function bootstrap(): Promise<void> {
  logger.info({ env: env.NODE_ENV }, 'Bootstrapping VANTA Trade AI server');

  // Sanity check DB
  await pool.query('SELECT 1');

  await recoverStaleJobs();
  startScheduler();

  // Schedule low-balance checks every 10 minutes
  setInterval(() => {
    pool.query(`SELECT user_id FROM wallets WHERE available_credits <= 100`)
      .then((res) => Promise.all(res.rows.map((r) => checkLowBalance(r.user_id))))
      .catch((err) => logger.warn({ err }, 'Low-balance sweep failed'));
  }, 10 * 60 * 1000).unref();

  const app = buildApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'HTTP server listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    stopScheduler();
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15_000).unref();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Fatal bootstrap error');
  process.exit(1);
});