import { getAccountDeals, getOpenPositions, type FxApiDeal } from './fxapis';
import { query } from './db';
import { logger } from './logger';

interface ClosedTrade {
  brokerTicket: string;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  entryPrice: number;
  closePrice: number | null;
  openedAt: string;
  closedAt: string;
  realizedPl: number | null;
  commission: number;
  swap: number;
  orderIds: string[];
  openingOrderIds: string[];
}

function isValidDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function aggregateClosedFxApisTrades(
  deals: FxApiDeal[],
  openPositionIds: Set<string>,
  orderToTicket: Map<string, string> = new Map(),
): ClosedTrade[] {
  const grouped = new Map<string, FxApiDeal[]>();
  for (const deal of deals) {
    const references = getDealOrderReferences(deal);
    const brokerTicket = deal.brokerPositionId
      ?? references.map((reference) => orderToTicket.get(reference)).find(Boolean);
    if (!brokerTicket) continue;
    const group = grouped.get(brokerTicket) ?? [];
    group.push(deal);
    grouped.set(brokerTicket, group);
  }

  const trades: ClosedTrade[] = [];
  for (const [brokerTicket, positionDeals] of grouped) {
    if (openPositionIds.has(brokerTicket)) continue;
    const ordered = positionDeals
      .filter((deal) => isValidDate(deal.dealtAt))
      .sort((a, b) => Date.parse(a.dealtAt) - Date.parse(b.dealtAt));
    const entries = ordered.filter((deal) =>
      deal.entry?.toLowerCase() === 'in'
      && (deal.dealType.toLowerCase() === 'buy' || deal.dealType.toLowerCase() === 'sell'),
    );
    const closes = ordered.filter((deal) =>
      ['out', 'out_by', 'inout'].includes(deal.entry?.toLowerCase() ?? ''),
    );
    if (entries.length === 0 || closes.length === 0) continue;

    const openingVolume = entries.reduce((sum, deal) => sum + (deal.volume ?? 0), 0);
    const entryValue = entries.reduce(
      (sum, deal) => sum + (deal.volume ?? 0) * (deal.price ?? 0),
      0,
    );
    if (openingVolume <= 0 || entries.some((deal) => deal.volume === null || deal.price === null)) continue;

    const closeVolume = closes.reduce((sum, deal) => sum + (deal.volume ?? 0), 0);
    const closePrice = closeVolume > 0 && closes.every((deal) => deal.volume !== null && deal.price !== null)
      ? closes.reduce((sum, deal) => sum + (deal.volume ?? 0) * (deal.price ?? 0), 0) / closeVolume
      : null;
    const firstEntry = entries[0];
    const lastClose = closes[closes.length - 1];
    const symbol = firstEntry?.symbol ?? ordered.find((deal) => deal.symbol)?.symbol;
    if (!firstEntry || !lastClose || !symbol) continue;
    const side = firstEntry.dealType.toLowerCase();
    if (side !== 'buy' && side !== 'sell') continue;

    const commission = ordered.reduce((sum, deal) => sum + (deal.commission ?? 0), 0);
    const swap = ordered.reduce((sum, deal) => sum + (deal.swap ?? 0), 0);
    const realizedPl = closes.every((deal) => deal.profit !== null)
      ? ordered.reduce(
        (sum, deal) => sum + (deal.profit ?? 0) + (deal.commission ?? 0)
          + (deal.swap ?? 0) + (deal.fee ?? 0),
        0,
      )
      : null;

    trades.push({
      brokerTicket,
      symbol,
      side,
      volume: openingVolume,
      entryPrice: entryValue / openingVolume,
      closePrice,
      openedAt: firstEntry.dealtAt,
      closedAt: lastClose.dealtAt,
      realizedPl,
      commission,
      swap,
      orderIds: [...new Set(ordered.flatMap(getDealOrderReferences))],
      openingOrderIds: [...new Set(entries.flatMap(getDealOrderReferences))],
    });
  }
  return trades;
}

function getDealOrderReferences(deal: FxApiDeal): string[] {
  const references = new Set<string>();
  if (deal.orderId) references.add(deal.orderId);
  const commentOrderId = deal.comment?.match(/^(?:vanta|close):([0-9a-f-]{36})$/i)?.[1];
  if (commentOrderId) references.add(commentOrderId);
  return [...references];
}

async function fetchAllDeals(providerAccountId: string): Promise<FxApiDeal[]> {
  const deals: FxApiDeal[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const page = await getAccountDeals(providerAccountId, cursor);
    deals.push(...page.deals);
    if (!page.hasMore) return deals;
    if (!page.nextCursor || seenCursors.has(page.nextCursor)) {
      throw new Error('FXAPIs returned invalid trade-history pagination.');
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

const syncsInProgress = new Map<string, Promise<number>>();
const recentlySynced = new Map<string, number>();

async function importAccountHistory(accountId: string, userId: string): Promise<number> {
  const accountResult = await query<{
    id: string;
    provider_account_id: string;
  }>(
    `SELECT id, provider_account_id
       FROM broker_accounts
      WHERE id = $1 AND user_id = $2 AND connection_provider = 'fxapis'`,
    [accountId, userId],
  );
  const account = accountResult.rows[0];
  if (!account?.provider_account_id) return 0;

  const [openPositions, deals, positionsResult, ordersResult] = await Promise.all([
    getOpenPositions(account.provider_account_id),
    fetchAllDeals(account.provider_account_id),
    query<{
      id: string;
      broker_ticket: string;
      bot_id: string;
      opening_order_id: string | null;
    }>(
      `SELECT p.id, p.broker_ticket, p.bot_id, p.opening_order_id
         FROM positions p
         JOIN bots b ON b.id = p.bot_id
        WHERE p.broker_account_id = $1 AND b.user_id = $2
          AND (p.source = 'platform' OR p.opening_order_id IS NOT NULL)`,
      [accountId, userId],
    ),
    query<{
      id: string;
      provider_order_id: string | null;
      broker_ticket: string | null;
      bot_id: string;
    }>(
      `SELECT o.id, o.provider_order_id, o.broker_ticket, o.bot_id
         FROM orders o
         JOIN bots b ON b.id = o.bot_id
        WHERE o.broker_account_id = $1 AND b.user_id = $2`,
      [accountId, userId],
    ),
  ]);
  const positionsByTicket = new Map(positionsResult.rows.map((position) => [position.broker_ticket, position]));
  const ordersByReference = new Map<string, typeof ordersResult.rows[number]>();
  const ordersByTicket = new Map<string, typeof ordersResult.rows>();
  const orderToTicket = new Map<string, string>();
  for (const order of ordersResult.rows) {
    ordersByReference.set(order.id, order);
    if (order.provider_order_id) ordersByReference.set(order.provider_order_id, order);
    if (order.broker_ticket) {
      const ticketOrders = ordersByTicket.get(order.broker_ticket) ?? [];
      ticketOrders.push(order);
      ordersByTicket.set(order.broker_ticket, ticketOrders);
      orderToTicket.set(order.id, order.broker_ticket);
      if (order.provider_order_id) orderToTicket.set(order.provider_order_id, order.broker_ticket);
    }
  }
  const trades = aggregateClosedFxApisTrades(
    deals,
    new Set(openPositions.map((position) => String(position.id))),
    orderToTicket,
  );
  if (trades.length === 0) return 0;

  const symbolsResult = await query<{ id: string; broker_symbol: string }>(
    `SELECT id, broker_symbol FROM broker_symbols WHERE broker_account_id = $1`,
    [accountId],
  );
  const symbolIds = new Map(symbolsResult.rows.map((row) => [row.broker_symbol, row.id]));

  let imported = 0;
  for (const trade of trades) {
    const existingPosition = positionsByTicket.get(trade.brokerTicket);
    const matchedOrdersById = new Map<string, typeof ordersResult.rows[number]>();
    for (const reference of trade.orderIds) {
      const order = ordersByReference.get(reference);
      if (order) matchedOrdersById.set(order.id, order);
    }
    for (const order of ordersByTicket.get(trade.brokerTicket) ?? []) {
      matchedOrdersById.set(order.id, order);
    }
    const matchedOrders = [...matchedOrdersById.values()];
    const matchedBotIds = new Set(matchedOrders.map((order) => order.bot_id));
    const botId = existingPosition?.bot_id
      ?? (matchedBotIds.size === 1 ? [...matchedBotIds][0] : undefined);
    if (!botId || (matchedBotIds.size > 1 && !existingPosition)) {
      logger.info(
        { brokerAccountId: accountId, brokerTicket: trade.brokerTicket },
        'Broker deal history ignored because it does not map to one VANTA bot trade',
      );
      continue;
    }

    const symbolId = symbolIds.get(trade.symbol);
    if (!symbolId) {
      logger.warn(
        { brokerAccountId: accountId, symbol: trade.symbol, brokerTicket: trade.brokerTicket },
        'Bot trade history skipped because its broker symbol is not registered',
      );
      continue;
    }
    const openingOrder = trade.openingOrderIds
      .map((reference) => ordersByReference.get(reference))
      .find((order) => order?.bot_id === botId);
    await query(
      `INSERT INTO positions
         (bot_id, broker_account_id, broker_symbol_id, broker_ticket, side, volume,
          opening_order_id, entry_price, close_price, opened_at, closed_at, realized_pl,
          commission, swap, closed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz,$12,$13,$14,
               'broker')
       ON CONFLICT (broker_account_id, broker_ticket) DO UPDATE
         SET bot_id = EXCLUDED.bot_id,
             broker_symbol_id = EXCLUDED.broker_symbol_id,
             opening_order_id = COALESCE(positions.opening_order_id, EXCLUDED.opening_order_id),
             side = EXCLUDED.side,
             volume = EXCLUDED.volume,
             entry_price = EXCLUDED.entry_price,
             opened_at = EXCLUDED.opened_at,
             close_price = EXCLUDED.close_price,
             closed_at = EXCLUDED.closed_at,
             realized_pl = EXCLUDED.realized_pl,
             commission = EXCLUDED.commission,
             swap = EXCLUDED.swap,
             source = 'platform',
             management_state = 'platform_managed',
             closed_by = 'broker',
             updated_at = now()`,
      [
        botId, accountId, symbolId, trade.brokerTicket, trade.side, trade.volume,
        existingPosition?.opening_order_id ?? openingOrder?.id ?? null,
        trade.entryPrice, trade.closePrice, trade.openedAt, trade.closedAt,
        trade.realizedPl, trade.commission, trade.swap,
      ],
    );
    imported += 1;
  }
  return imported;
}

export async function syncFxApisTradeHistory(userId: string): Promise<{
  imported: number;
  failedAccounts: number;
}> {
  const accountsResult = await query<{ id: string }>(
    `SELECT id FROM broker_accounts
      WHERE user_id = $1 AND connection_provider = 'fxapis'
      ORDER BY created_at ASC`,
    [userId],
  );
  let imported = 0;
  let failedAccounts = 0;
  for (const account of accountsResult.rows) {
    const running = syncsInProgress.get(account.id);
    if (running) {
      try {
        imported += await running;
      } catch (err) {
        failedAccounts += 1;
        logger.warn({ err, brokerAccountId: account.id }, 'FXAPIs closed trade history sync failed');
      }
      continue;
    }
    const lastSynced = recentlySynced.get(account.id);
    if (lastSynced && Date.now() - lastSynced < 30_000) continue;

    const sync = importAccountHistory(account.id, userId);
    syncsInProgress.set(account.id, sync);
    try {
      imported += await sync;
      recentlySynced.set(account.id, Date.now());
    } catch (err) {
      failedAccounts += 1;
      logger.warn({ err, brokerAccountId: account.id }, 'FXAPIs closed trade history sync failed');
    } finally {
      if (syncsInProgress.get(account.id) === sync) syncsInProgress.delete(account.id);
    }
  }
  return { imported, failedAccounts };
}
