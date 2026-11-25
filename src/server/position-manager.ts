import { query } from './db';
import { closePosition } from './execution';
import { fetchBrokerPositions } from './broker-providers';
import { logger } from './logger';
import type { BrokerProvider } from '../shared/types';

interface ManagedPosition {
  id: string;
  user_id: string;
  broker_ticket: string;
  broker_account_id: string;
  connection_provider: BrokerProvider;
  provider_account_id: string;
}

export async function manageProfitablePositions(brokerAccountId: string): Promise<void> {
  const result = await query<ManagedPosition>(
    `SELECT p.id, b.user_id, p.broker_ticket, p.broker_account_id,
            ba.connection_provider, ba.provider_account_id
       FROM positions p
       JOIN bots b ON b.id = p.bot_id
       JOIN broker_accounts ba ON ba.id = p.broker_account_id
      WHERE p.broker_account_id = $1
        AND p.closed_at IS NULL
        AND p.management_state = 'platform_managed'
        AND p.source = 'platform'
      ORDER BY p.opened_at`,
    [brokerAccountId],
  );
  const positions = result.rows;
  if (positions.length === 0) return;

  const account = positions[0];
  if (!account) return;

  let brokerPositions;
  try {
    brokerPositions = await fetchBrokerPositions(account.connection_provider, account.provider_account_id);
  } catch (error) {
    logger.warn({ err: error, brokerAccountId }, 'Profit monitor could not fetch broker positions');
    return;
  }

  const brokerPositionsByTicket = new Map(brokerPositions.map((position) => [String(position.id), position]));
  for (const position of positions) {
    const snapshot = brokerPositionsByTicket.get(position.broker_ticket);
    if (!snapshot) continue;

    const currentPrice = snapshot.currentPrice !== null && Number.isFinite(snapshot.currentPrice)
      ? snapshot.currentPrice
      : null;
    const grossProfit = snapshot.profit !== null && Number.isFinite(snapshot.profit) ? snapshot.profit : null;
    const commission = snapshot.commission !== null && Number.isFinite(snapshot.commission)
      ? snapshot.commission
      : null;
    const swap = snapshot.swap !== null && Number.isFinite(snapshot.swap) ? snapshot.swap : null;
    const floatingPl = grossProfit === null || (snapshot.commission !== null && commission === null)
      || (snapshot.swap !== null && swap === null)
      ? null
      : grossProfit + (commission ?? 0) + (swap ?? 0);
    await query(
      `UPDATE positions
          SET current_price = COALESCE($2, current_price),
              floating_pl = COALESCE($3, floating_pl),
              commission = COALESCE($4, commission),
              swap = COALESCE($5, swap),
              updated_at = now()
        WHERE id = $1 AND closed_at IS NULL`,
      [position.id, currentPrice, floatingPl, commission, swap],
    );

    if (floatingPl === null || floatingPl <= 0) continue;

    try {
      await closePosition({
        userId: position.user_id,
        positionId: position.id,
        closedBy: 'platform',
      });
    } catch (error) {
      logger.warn(
        { err: error, brokerAccountId, positionId: position.id, profit: snapshot.profit },
        'Profit monitor could not close a profitable position',
      );
    }
  }
}
