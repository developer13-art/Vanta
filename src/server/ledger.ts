import { PoolClient } from 'pg';
import { withTransaction, query } from './db';
import { Errors } from './errors';

export type LedgerEvent =
  | 'purchase'
  | 'promotional_grant'
  | 'refund'
  | 'adjustment'
  | 'reversal'
  | 'charge_open'
  | 'charge_close'
  | 'charge_ai'
  | 'charge_service'
  | 'expiry';

export interface LedgerArgs {
  userId: string;
  delta: number;              // negative = debit, positive = credit
  eventType: LedgerEvent;
  reason: string;
  botId?: string | null;
  brokerAccountId?: string | null;
  orderId?: string | null;
  positionId?: string | null;
  rateVersion?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
}

async function applyWithClient(client: PoolClient, args: LedgerArgs): Promise<number> {
  // Lock wallet row, compute new balance, insert ledger, update wallet — atomically.
  const walletRes = await client.query<{ available_credits: number; reserved_credits: number }>(
    `SELECT available_credits, reserved_credits FROM wallets WHERE user_id = $1 FOR UPDATE`,
    [args.userId],
  );
  if (walletRes.rows.length === 0) throw Errors.notFound('Wallet not found');
  const wallet = walletRes.rows[0];

  const newAvailable = wallet.available_credits + args.delta;
  if (newAvailable < 0) throw Errors.insufficientCredits();

  const insertRes = await client.query<{ id: string }>(
    `INSERT INTO credit_ledger
       (user_id, delta, balance_after, event_type, reason,
        bot_id, broker_account_id, order_id, position_id,
        rate_version, idempotency_key, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      args.userId,
      args.delta,
      newAvailable,
      args.eventType,
      args.reason,
      args.botId ?? null,
      args.brokerAccountId ?? null,
      args.orderId ?? null,
      args.positionId ?? null,
      args.rateVersion ?? null,
      args.idempotencyKey ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  );

  // If idempotency_key conflicted, do not double-apply.
  if (insertRes.rows.length === 0) return newAvailable;

  const lifetimeUsedDelta = args.delta < 0 ? -args.delta : 0;
  const lifetimePurchasedDelta = args.eventType === 'purchase' ? args.delta : 0;

  await client.query(
    `UPDATE wallets
       SET available_credits = $2,
           lifetime_used = lifetime_used + $3,
           lifetime_purchased = lifetime_purchased + $4,
           updated_at = now()
     WHERE user_id = $1`,
    [args.userId, newAvailable, lifetimeUsedDelta, lifetimePurchasedDelta],
  );

  return newAvailable;
}

export function applyLedgerInTransaction(client: PoolClient, args: LedgerArgs): Promise<number> {
  return applyWithClient(client, args);
}

export async function applyLedger(args: LedgerArgs): Promise<number> {
  return withTransaction((client) => applyLedgerInTransaction(client, args));
}

export async function getWallet(userId: string) {
  const res = await query<{
    user_id: string;
    available_credits: number;
    reserved_credits: number;
    lifetime_purchased: number;
    lifetime_used: number;
    auto_topup_enabled: boolean;
    auto_topup_threshold: number | null;
    auto_topup_package: string | null;
    auto_topup_cap: number | null;
    auto_topup_frequency: string | null;
  }>(`SELECT * FROM wallets WHERE user_id = $1`, [userId]);
  return res.rows[0] ?? null;
}

export async function listLedger(userId: string, limit = 100, offset = 0) {
  const res = await query(
    `SELECT id, delta, balance_after, event_type, reason, bot_id, broker_account_id,
            order_id, position_id, rate_version, metadata, created_at
       FROM credit_ledger
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return res.rows;
}