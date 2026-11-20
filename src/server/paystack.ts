import { env } from './env';
import { Errors } from './errors';
import { hmacSha256Hex, safeEqualHex } from './crypto';
import { PACKAGES, PackageCode } from './credit-rates';
import { withTransaction, query } from './db';
import { applyLedgerInTransaction } from './ledger';
import { logger } from './logger';

interface InitResult { authorizationUrl: string; reference: string }

export async function initPayment(args: {
  userId: string;
  email: string;
  packageCode: PackageCode;
}): Promise<InitResult> {
  const pkg = PACKAGES[args.packageCode];
  if (!pkg) throw Errors.badRequest('Unknown package');
  const email = args.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Errors.badRequest('The email on your VANTA account is invalid. Contact support@vantatrade.ai to correct it before purchasing credits.');
  }

  const reference = `vanta-${args.userId.slice(0, 8)}-${Date.now()}`;
  const amountKobo = pkg.priceNgn * 100;

  const res = await fetch(`${env.PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: amountKobo,
      currency: env.PAYSTACK_CURRENCY,
      reference,
      metadata: { userId: args.userId, packageCode: args.packageCode, credits: pkg.credits },
      callback_url: `${env.APP_BASE_URL}/app/wallet?ref=${reference}`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    let providerMessage = text;
    try {
      const payload: unknown = JSON.parse(text);
      if (typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string') {
        providerMessage = payload.message;
      }
    } catch {
      providerMessage = text;
    }
    const emailRejected = /"email"\s+must be a valid email/i.test(providerMessage);
    logger.error({ status: res.status, reason: emailRejected ? 'invalid_email' : 'provider_rejected' }, 'Paystack init failed');
    if (emailRejected) {
      throw Errors.badRequest('Paystack rejected the email on your VANTA account. Contact support@vantatrade.ai to correct it before retrying.');
    }
    throw Errors.unavailable('Payment provider rejected the request');
  }
  const data = (await res.json()) as { status: boolean; data?: { authorization_url: string; reference: string } };
  if (!data.status || !data.data) throw Errors.unavailable('Payment provider error');
  if (data.data.reference !== reference) throw Errors.unavailable('Payment provider returned an unexpected reference');

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

type PaymentConfirmation =
  | { status: 'successful'; creditsGranted: number }
  | { status: 'pending' | 'failed' };

interface PaymentRow {
  id: string;
  user_id: string;
  credits_granted: number;
  package_code: string;
  amount: string;
  currency: string;
  status: string;
}

async function finalizeSuccessfulPayment(
  reference: string,
  amount: number,
  currency: string,
  providerPayload: unknown,
): Promise<PaymentConfirmation> {
  return withTransaction(async (client) => {
    const res = await client.query<PaymentRow>(
      `SELECT id, user_id, credits_granted, package_code, amount, currency, status
         FROM payments WHERE provider_reference = $1 FOR UPDATE`,
      [reference],
    );
    const payment = res.rows[0];
    if (!payment) {
      logger.warn({ reference }, 'Confirmation for unknown payment reference');
      return { status: 'failed' };
    }
    if (payment.status === 'successful') {
      return { status: 'successful', creditsGranted: payment.credits_granted };
    }
    if (payment.status !== 'pending') {
      return { status: payment.status === 'failed' ? 'failed' : 'pending' };
    }

    const expectedKobo = Math.round(Number(payment.amount) * 100);
    if (amount !== expectedKobo || currency.toUpperCase() !== payment.currency.toUpperCase()) {
      logger.error({
        reference,
        expectedAmount: expectedKobo,
        receivedAmount: amount,
        expectedCurrency: payment.currency,
        receivedCurrency: currency,
      }, 'Payment verification mismatch');
      await client.query(
        `UPDATE payments SET status='failed', provider_payload=$2, updated_at=now() WHERE id=$1`,
        [payment.id, JSON.stringify(providerPayload)],
      );
      return { status: 'failed' };
    }

    await client.query(
      `UPDATE payments
          SET status='successful', paid_at=now(), provider_payload=$2, updated_at=now()
        WHERE id=$1`,
      [payment.id, JSON.stringify(providerPayload)],
    );
    await applyLedgerInTransaction(client, {
      userId: payment.user_id,
      delta: payment.credits_granted,
      eventType: 'purchase',
      reason: `paystack:${reference}`,
      idempotencyKey: `purchase:${reference}`,
      metadata: { packageCode: payment.package_code, provider: 'paystack' },
    });

    logger.info({ reference }, 'Paystack payment granted credits');
    return { status: 'successful', creditsGranted: payment.credits_granted };
  });
}

export async function verifyPaymentForUser(reference: string, userId: string): Promise<PaymentConfirmation> {
  const paymentResult = await query<PaymentRow>(
    `SELECT id, user_id, credits_granted, package_code, amount, currency, status
       FROM payments WHERE provider_reference = $1 AND user_id = $2`,
    [reference, userId],
  );
  const payment = paymentResult.rows[0];
  if (!payment) throw Errors.notFound('Payment not found');
  if (payment.status === 'successful') {
    return { status: 'successful', creditsGranted: payment.credits_granted };
  }
  if (payment.status !== 'pending') {
    return { status: payment.status === 'failed' ? 'failed' : 'pending' };
  }

  const response = await fetch(
    `${env.PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } },
  );
  if (!response.ok) {
    logger.error({ status: response.status, reference }, 'Paystack verification request failed');
    throw Errors.unavailable('Could not verify payment with the provider. Please try again.');
  }

  const verification = (await response.json()) as {
    status: boolean;
    data?: { reference: string; status: string; amount: number; currency: string };
  };
  if (!verification.status || !verification.data) {
    throw Errors.unavailable('Payment provider could not verify this transaction. Please try again.');
  }
  const providerPayment = verification.data;
  if (
    typeof providerPayment.reference !== 'string'
    || typeof providerPayment.status !== 'string'
    || !Number.isSafeInteger(providerPayment.amount)
    || typeof providerPayment.currency !== 'string'
  ) {
    throw Errors.unavailable('Payment provider returned incomplete verification details.');
  }
  if (providerPayment.reference !== reference) {
    logger.error({ reference, receivedReference: providerPayment.reference }, 'Paystack verification reference mismatch');
    throw Errors.unavailable('Payment provider returned an unexpected reference.');
  }

  if (providerPayment.status === 'success') {
    return finalizeSuccessfulPayment(reference, providerPayment.amount, providerPayment.currency, verification);
  }
  if (providerPayment.status === 'failed') {
    const failed = await query<{ status: string }>(
      `UPDATE payments
          SET status='failed', provider_payload=$3, updated_at=now()
        WHERE provider_reference=$1 AND user_id=$2 AND status='pending'
        RETURNING status`,
      [reference, userId, JSON.stringify(verification)],
    );
    if (failed.rows[0]) return { status: 'failed' };
    const latest = await query<{ status: string; credits_granted: number }>(
      `SELECT status, credits_granted FROM payments WHERE provider_reference=$1 AND user_id=$2`,
      [reference, userId],
    );
    if (latest.rows[0]?.status === 'successful') {
      return { status: 'successful', creditsGranted: latest.rows[0].credits_granted };
    }
    return { status: latest.rows[0]?.status === 'pending' ? 'pending' : 'failed' };
  }
  return { status: 'pending' };
}

export async function handleWebhookEvent(rawBody: Buffer): Promise<void> {
  const parsed = JSON.parse(rawBody.toString('utf8')) as {
    event: string;
    data: { reference: string; status: string; amount: number; currency: string };
  };
  if (parsed.event !== 'charge.success') return;

  const { reference, status, amount, currency } = parsed.data;
  if (status !== 'success') return;

  await finalizeSuccessfulPayment(reference, amount, currency, parsed);
}