import { env } from './env';
import { Errors } from './errors';
import { hmacSha256Hex, safeEqualHex } from './crypto';
import { PACKAGES, PackageCode } from './credit-rates';
import { withTransaction, query } from './db';
import { applyLedger } from './ledger';
import { logger } from './logger';

interface InitResult { authorizationUrl: string; reference: string }

export async function initPayment(args: {
  userId: string;
  email: string;
  packageCode: PackageCode;
}): Promise<InitResult> {
  const pkg = PACKAGES[args.packageCode];
  if (!pkg) throw Errors.badRequest('Unknown package');

  const reference = `vanta-${args.userId.slice(0, 8)}-${Date.now()}`;
  const amountKobo = pkg.priceNgn * 100;

  const res = await fetch(`${env.PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: args.email,
      amount: amountKobo,
      currency: env.PAYSTACK_CURRENCY,
      reference,
      metadata: { userId: args.userId, packageCode: args.packageCode, credits: pkg.credits },
      callback_url: `${env.APP_BASE_URL}/app/wallet?ref=${reference}`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, text }, 'Paystack init failed');
    throw Errors.unavailable('Payment provider rejected the request');
  }
  const data = (await res.json()) as { status: boolean; data?: { authorization_url: string; reference: string } };
  if (!data.status || !data.data) throw Errors.unavailable('Payment provider error');

  await query(
    `INSERT INTO payments (user_id, provider, provider_reference, package_code, credits_granted, amount, currency, status)
     VALUES ($1,'paystack',$2,$3,$4,$5,$6,'pending')`,
    [args.userId, reference, args.packageCode, pkg.credits, pkg.priceNgn, env.PAYSTACK_CURRENCY],
  );

  return { authorizationUrl: data.data.authorization_url, reference };
}

/**
 * Verifies a Paystack webhook signature. Must receive the RAW body.
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature) return false;
  const computed = hmacSha256Hex(env.PAYSTACK_SECRET_KEY, rawBody.toString('utf8'));
  return safeEqualHex(computed, signature);
}

export async function handleWebhookEvent(rawBody: Buffer): Promise<void> {
  const parsed = JSON.parse(rawBody.toString('utf8')) as {
    event: string;
    data: { reference: string; status: string; amount: number; currency: string };
  };
  if (parsed.event !== 'charge.success') return;

  const { reference, status, amount } = parsed.data;
  if (status !== 'success') return;

  // Idempotent: lock payment row, only grant if still 'pending'
  await withTransaction(async (client) => {
    const res = await client.query<{
      id: string; user_id: string; credits_granted: number;
      package_code: string; amount: string; status: string;
    }>(
      `SELECT id, user_id, credits_granted, package_code, amount, status
         FROM payments WHERE provider_reference = $1 FOR UPDATE`,
      [reference],
    );
    const payment = res.rows[0];
    if (!payment) {
      logger.warn({ reference }, 'Webhook for unknown payment reference');
      return;
    }
    if (payment.status === 'successful') return; // already processed

    const expectedKobo = Math.round(Number(payment.amount) * 100);
    if (amount !== expectedKobo) {
      logger.error({ reference, expected: expectedKobo, received: amount }, 'Amount mismatch');
      await client.query(`UPDATE payments SET status='failed', provider_payload=$2 WHERE id=$1`, [
        payment.id, JSON.stringify(parsed),
      ]);
      return;
    }

    await client.query(
      `UPDATE payments SET status='successful', paid_at=now(), provider_payload=$2 WHERE id=$1`,
      [payment.id, JSON.stringify(parsed)],
    );

    await applyLedger({
      userId: payment.user_id,
      delta: payment.credits_granted,
      eventType: 'purchase',
      reason: `paystack:${reference}`,
      idempotencyKey: `purchase:${reference}`,
      metadata: { packageCode: payment.package_code, provider: 'paystack' },
    });
  });

  logger.info({ reference }, 'Paystack payment granted credits');
}