import { withTransaction } from './db';
import { Errors } from './errors';
import type { updateBotSchema } from './schema';

type BotConfiguration = typeof updateBotSchema._type;

export async function updateBotConfiguration(
  botId: string,
  userId: string,
  config: BotConfiguration,
): Promise<void> {
  await withTransaction(async (client) => {
    const bot = await client.query<{ broker_account_id: string; state: string }>(
      `SELECT broker_account_id, state
         FROM bots
        WHERE id=$1 AND user_id=$2
        FOR UPDATE`,
      [botId, userId],
    );
    const current = bot.rows[0];
    if (!current) throw Errors.notFound();
    if (!['ready', 'paused', 'stopped', 'management_only', 'error'].includes(current.state)) {
      throw Errors.conflict('Pause or stop the bot before editing its configuration');
    }

    const symbols = await client.query<{ id: string }>(
      `SELECT id FROM broker_symbols
        WHERE id = ANY($1::uuid[]) AND broker_account_id = $2`,
      [config.brokerSymbolIds, current.broker_account_id],
    );
    if (symbols.rows.length !== config.brokerSymbolIds.length) {
      throw Errors.badRequest('One or more instruments do not belong to this bot’s broker account');
    }

    await client.query(
      `UPDATE bots
          SET name=$3, lot_size=$4, entry_batch_size=$5, max_concurrent_positions=$6,
              daily_loss_limit=$7, drawdown_limit=$8, margin_utilization_limit=$9,
              max_spread_points=$10, cooldown_seconds=$11, stop_behavior=$12,
              updated_at=now()
        WHERE id=$1 AND user_id=$2`,
      [
        botId, userId, config.name, config.lotSize, config.entryBatchSize,
        config.maxConcurrentPositions, config.dailyLossLimit, config.drawdownLimit,
        config.marginUtilizationLimit, config.maxSpreadPoints, config.cooldownSeconds,
        config.stopBehavior,
      ],
    );
    await client.query(`DELETE FROM bot_instruments WHERE bot_id=$1`, [botId]);
    for (const symbolId of config.brokerSymbolIds) {
      await client.query(
        `INSERT INTO bot_instruments (bot_id, broker_symbol_id) VALUES ($1,$2)`,
        [botId, symbolId],
      );
    }
  });
}
