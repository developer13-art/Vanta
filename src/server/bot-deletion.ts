import { withTransaction } from './db';
import { Errors } from './errors';

export async function deleteBotForUser(botId: string, userId: string): Promise<void> {
  await withTransaction(async (client) => {
    const bot = await client.query<{ id: string }>(
      `SELECT id FROM bots WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [botId, userId],
    );
    if (!bot.rows[0]) throw Errors.notFound();

    const open = await client.query<{ count: string }>(
      `SELECT count(*) FROM positions WHERE bot_id=$1 AND closed_at IS NULL`,
      [botId],
    );
    if (Number(open.rows[0]?.count ?? 0) > 0) {
      throw Errors.conflict('Close all positions before deleting this bot');
    }

    await client.query(
      `UPDATE credit_ledger
          SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'deletedBotId', bot_id,
                'deletedOrderId', order_id,
                'deletedPositionId', position_id
              ),
              bot_id=NULL, order_id=NULL, position_id=NULL
        WHERE bot_id=$1
           OR order_id IN (SELECT id FROM orders WHERE bot_id=$1)
           OR position_id IN (SELECT id FROM positions WHERE bot_id=$1)`,
      [botId],
    );
    await client.query(`UPDATE credit_reservations SET bot_id=NULL WHERE bot_id=$1`, [botId]);

    const deleted = await client.query<{ id: string }>(
      `DELETE FROM bots WHERE id=$1 AND user_id=$2 RETURNING id`,
      [botId, userId],
    );
    if (!deleted.rows[0]) throw Errors.notFound();
  });
}
