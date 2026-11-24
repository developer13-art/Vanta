import crypto from 'node:crypto';
import { env } from './env';
import { AppError, Errors } from './errors';
import { logger } from './logger';
import { hmacSha256Hex, safeEqualHex, randomToken } from './crypto';
import { PACKAGES, PackageCode } from './credit-rates';
import { withTransaction, query } from './db';
import { applyLedgerInTransaction } from './ledger';
import { currencyDecimals, exchangeRates, PAYMENT_CURRENCIES, PaymentCurrency, quoteUsdAmount, toMinorUnits } from './payment-fx';

export type PaymentProvider = 'paystack' | 'flutterwave' | 'stripe';
export type PaymentMethod = 'card' | 'bank_transfer';
export interface PaymentOption {
  provider: PaymentProvider;
  method: PaymentMethod;
  label: string;
}

const CURRENCY_SET = new Set<string>(PAYMENT_CURRENCIES);
const STRIPE_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'MXN']);
const STRIPE_BANK_TYPES: Record<string, string> = {
  USD: 'us_bank_transfer',
  EUR: 'eu_bank_transfer',
  GBP: 'gb_bank_transfer',
  JPY: 'jp_bank_transfer',
  MXN: 'mx_bank_transfer',
};

function isPaymentCurrency(value: string): value is PaymentCurrency {
  return CURRENCY_SET.has(value);
}

function configuredCurrencies(value: string): Set<string> {
  return new Set(value.split(',').map((currency) => currency.trim().toUpperCase()).filter((currency) => CURRENCY_SET.has(currency)));
}

export async function getPaymentOptions(): Promise<{
  currencies: Array<{ code: PaymentCurrency; methods: PaymentOption[] }>;
  ratesUpdatedAt: string;
}> {
  const rates = await exchangeRates();
  const flutterwaveCurrencies = configuredCurrencies(env.FLUTTERWAVE_CURRENCIES);
  const stripeBankTransferCurrencies = configuredCurrencies(env.STRIPE_BANK_TRANSFER_CURRENCIES);
  const currencies = PAYMENT_CURRENCIES.map((code) => {
    const methods: PaymentOption[] = [];
    if (code === env.PAYSTACK_CURRENCY.toUpperCase()) {
      methods.push({ provider: 'paystack', method: 'card', label: 'Paystack' });
    }
    if (env.FLUTTERWAVE_SECRET_KEY && env.FLUTTERWAVE_WEBHOOK_SECRET_HASH && flutterwaveCurrencies.has(code)) {
      methods.push({ provider: 'flutterwave', method: 'card', label: 'Flutterwave' });
    }
    if (env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && STRIPE_CURRENCIES.has(code)) {
      methods.push({ provider: 'stripe', method: 'card', label: 'Stripe' });
      if (stripeBankTransferCurrencies.has(code) && STRIPE_BANK_TYPES[code]) {
        methods.push({ provider: 'stripe', method: 'bank_transfer', label: 'Bank transfer' });
      }
    }
    return { code, methods };
  }).filter((currency) => currency.methods.length > 0);

  return { currencies, ratesUpdatedAt: rates.updatedAt };
}

export async function listPackagesForCurrency(currency: string): Promise<Array<{
  code: PackageCode;
  credits: number;
  priceUsd: number;
  priceNgn: number;
  amount: number;
  currency: PaymentCurrency;
  ratesUpdatedAt: string;
}>> {
  if (!isPaymentCurrency(currency)) throw Errors.badRequest('Unsupported payment currency');
  const selectedCurrency = currency;
  const quote = await quoteUsdAmount(1, selectedCurrency);
  return Object.entries(PACKAGES).map(([code, pkg]) => ({
    code: code as PackageCode,
    credits: pkg.credits,
    priceUsd: pkg.price,
    priceNgn: pkg.priceNgn,
    amount: Math.round(pkg.price * quote.rate * (10 ** currencyDecimals(selectedCurrency))) / (10 ** currencyDecimals(selectedCurrency)),
    currency: selectedCurrency,
    ratesUpdatedAt: quote.updatedAt,
  }));
}

interface InitPaymentArgs {
  userId: string;
  email: string;
  packageCode: PackageCode;
  provider: PaymentProvider;
  method: PaymentMethod;
  currency: PaymentCurrency;
}

interface InitResult {
  authorizationUrl: string;
  reference: string;
}

class ProviderRejectedError extends Error {}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function makeReference(userId: string): string {
  return `vanta-${userId.slice(0, 8)}-${Date.now()}-${randomToken(6)}`;
}

async function setInitializationFailed(reference: string, message: string): Promise<never> {
  await query(
    `UPDATE payments
        SET status='failed', provider_payload=COALESCE(provider_payload, '{}'::jsonb) || $2::jsonb, updated_at=now()
      WHERE provider_reference=$1 AND status='pending'`,
    [reference, JSON.stringify({ initializationError: message })],
  );
  throw Errors.unavailable('Payment provider could not start checkout. Please try again.');
}

async function stripeRequest(path: string, body: URLSearchParams, idempotencyKey: string): Promise<unknown> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idempotencyKey,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    logger.error({ status: response.status, path }, 'Stripe request failed');
    throw new ProviderRejectedError('Stripe rejected the checkout request');
  }
  return payload;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

async function initStripe(args: InitPaymentArgs, reference: string, amount: number): Promise<{
  authorizationUrl: string;
  transactionId: string;
}> {
  let customerId: string | undefined;
  if (args.method === 'bank_transfer') {
    const customerResponse = objectValue(await stripeRequest('customers', new URLSearchParams({ email: args.email }), `stripe-customer-${reference}`));
    customerId = typeof customerResponse?.id === 'string' ? customerResponse.id : undefined;
    if (!customerId) throw new ProviderRejectedError('Stripe did not return a customer ID');
  }

  const form = new URLSearchParams({
    mode: 'payment',
    success_url: `${env.APP_BASE_URL}/app/wallet?ref=${encodeURIComponent(reference)}`,
    cancel_url: `${env.APP_BASE_URL}/app/wallet?checkout=cancelled`,
    client_reference_id: reference,
    customer_email: args.email,
    'line_items[0][price_data][currency]': args.currency.toLowerCase(),
    'line_items[0][price_data][product_data][name]': `${PACKAGES[args.packageCode].credits.toLocaleString()} VANTA credits`,
    'line_items[0][price_data][unit_amount]': String(toMinorUnits(amount, args.currency)),
    'line_items[0][quantity]': '1',
    'metadata[reference]': reference,
    'metadata[packageCode]': args.packageCode,
    'metadata[userId]': args.userId,
    'metadata[method]': args.method,
  });

  if (args.method === 'bank_transfer') {
    const bankType = STRIPE_BANK_TYPES[args.currency];
    if (!bankType || !customerId) throw Errors.badRequest('Bank transfer is not available for this currency.');
    form.delete('customer_email');
    form.set('customer', customerId);
    form.set('payment_method_types[0]', 'customer_balance');
    form.set('payment_method_options[customer_balance][funding_type]', 'bank_transfer');
    form.set('payment_method_options[customer_balance][bank_transfer][type]', bankType);
  } else {
    form.set('payment_method_types[0]', 'card');
  }

  const session = objectValue(await stripeRequest('checkout/sessions', form, `checkout-${reference}`));
  if (typeof session?.url !== 'string' || typeof session.id !== 'string') {
    throw new ProviderRejectedError('Stripe did not return a valid checkout session');
  }
  return { authorizationUrl: session.url, transactionId: session.id };
}

export async function startPayment(args: InitPaymentArgs): Promise<InitResult> {
  const pkg = PACKAGES[args.packageCode];
  if (!pkg) throw Errors.badRequest('Unknown package');
  const email = args.email.trim().toLowerCase();
  if (!isValidEmail(email)) {
    throw Errors.badRequest('The email on your VANTA account is invalid. Contact support@vantatrade.ai to correct it before purchasing credits.');
  }

  const available = await getPaymentOptions();
  const currencyOptions = available.currencies.find(({ code }) => code === args.currency);
  if (!currencyOptions?.methods.some(({ provider, method }) => provider === args.provider && method === args.method)) {
    throw Errors.badRequest('The selected payment method is not available for this currency.');
  }

  const quote = await quoteUsdAmount(pkg.price, args.currency);
  const reference = makeReference(args.userId);
  await query(
    `INSERT INTO payments (user_id, provider, provider_reference, package_code, credits_granted, amount, currency, status, provider_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8)`,
    [args.userId, args.provider, reference, args.packageCode, pkg.credits, quote.amount, args.currency,
      JSON.stringify({ method: args.method, fxRate: quote.rate, fxUpdatedAt: quote.updatedAt })],
  );

  let authorizationUrl: string;
  let transactionId: string | null = null;
  try {
    if (args.provider === 'paystack') {
      const response = await fetch(`${env.PAYSTACK_BASE_URL}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          amount: toMinorUnits(quote.amount, args.currency),
          currency: args.currency,
          reference,
          metadata: { userId: args.userId, packageCode: args.packageCode, credits: pkg.credits },
          callback_url: `${env.APP_BASE_URL}/app/wallet?ref=${encodeURIComponent(reference)}`,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        const text = await response.text();
        let providerMessage = text;
        try {
          const payload = objectValue(JSON.parse(text));
          if (typeof payload?.message === 'string') providerMessage = payload.message;
        } catch {
          providerMessage = text;
        }
        const emailRejected = /"email"\s+must be a valid email/i.test(providerMessage);
        logger.error({ status: response.status, reason: emailRejected ? 'invalid_email' : 'provider_rejected' }, 'Paystack init failed');
        if (emailRejected) {
          await query(`UPDATE payments SET status='failed', updated_at=now() WHERE provider_reference=$1`, [reference]);
          throw Errors.badRequest('Paystack rejected the email on your VANTA account. Contact support@vantatrade.ai to correct it before retrying.');
        }
        return await setInitializationFailed(reference, 'Paystack rejected checkout');
      }
      const result = objectValue(await response.json());
      const data = objectValue(result?.data);
      if (result?.status !== true || typeof data?.authorization_url !== 'string' || data.reference !== reference) {
        logger.error({ reference }, 'Paystack returned an invalid checkout response');
        return await setInitializationFailed(reference, 'Paystack returned an invalid checkout response');
      }
      authorizationUrl = data.authorization_url;
    } else if (args.provider === 'flutterwave') {
      const response = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tx_ref: reference,
          amount: quote.amount,
          currency: args.currency,
          redirect_url: `${env.APP_BASE_URL}/app/wallet?ref=${encodeURIComponent(reference)}`,
          payment_options: 'card',
          customer: { email },
          customizations: { title: 'VANTA Trade AI', description: `${pkg.credits.toLocaleString()} VANTA credits` },
          meta: { userId: args.userId, packageCode: args.packageCode, credits: pkg.credits },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        logger.error({ status: response.status }, 'Flutterwave checkout initialization failed');
        return await setInitializationFailed(reference, 'Flutterwave rejected checkout');
      }
      const result = objectValue(await response.json());
      const data = objectValue(result?.data);
      if (result?.status !== 'success' || typeof data?.link !== 'string') {
        logger.error({ reference }, 'Flutterwave returned an invalid checkout response');
        return await setInitializationFailed(reference, 'Flutterwave returned an invalid checkout response');
      }
      authorizationUrl = data.link;
      if (typeof data.id === 'number' && Number.isSafeInteger(data.id)) transactionId = String(data.id);
    } else {
      const result = await initStripe(args, reference, quote.amount);
      authorizationUrl = result.authorizationUrl;
      transactionId = result.transactionId;
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof ProviderRejectedError) {
      return await setInitializationFailed(reference, 'Stripe rejected checkout');
    }
    logger.error({ provider: args.provider, reference, error }, 'Payment checkout initialization failed');
    throw Errors.unavailable('Payment checkout could not be started. Please try again.');
  }

  await query(
    `UPDATE payments
        SET provider_transaction_id=$2, provider_payload=provider_payload || $3::jsonb, updated_at=now()
      WHERE provider_reference=$1 AND status='pending'`,
    [reference, transactionId, JSON.stringify({ transactionId })],
  );
  return { authorizationUrl, reference };
}

interface PaymentRow {
  id: string;
  user_id: string;
  provider: PaymentProvider;
  provider_reference: string;
  provider_transaction_id: string | null;
  credits_granted: number;
  package_code: string;
  amount: string;
  currency: string;
  status: string;
}

export type PaymentConfirmation =
  | { status: 'successful'; creditsGranted: number }
  | { status: 'pending' | 'failed' };

function amountMatches(actual: number, expected: string, currency: string): boolean {
  return Number.isFinite(actual) && toMinorUnits(actual, currency) === toMinorUnits(Number(expected), currency);
}

async function finalizeSuccessfulPayment(
  reference: string,
  amount: number,
  currency: string,
  providerPayload: unknown,
  provider: PaymentProvider,
  providerTransactionId?: string,
): Promise<PaymentConfirmation> {
  return withTransaction(async (client) => {
    const result = await client.query<PaymentRow>(
      `SELECT id, user_id, provider, provider_reference, provider_transaction_id,
              credits_granted, package_code, amount, currency, status
         FROM payments WHERE provider_reference = $1 FOR UPDATE`,
      [reference],
    );
    const payment = result.rows[0];
    if (!payment) {
      logger.warn({ reference, provider }, 'Confirmation for unknown payment reference');
      return { status: 'failed' };
    }
    if (payment.provider !== provider) {
      logger.error({ reference, expectedProvider: payment.provider, receivedProvider: provider }, 'Payment provider mismatch');
      return { status: 'failed' };
    }
    if (payment.status === 'successful') return { status: 'successful', creditsGranted: payment.credits_granted };
    if (payment.status !== 'pending') return { status: payment.status === 'failed' ? 'failed' : 'pending' };

    if (!amountMatches(amount, payment.amount, payment.currency) || currency.toUpperCase() !== payment.currency.toUpperCase()) {
      logger.error({
        reference,
        expectedAmount: payment.amount,
        receivedAmount: amount,
        expectedCurrency: payment.currency,
        receivedCurrency: currency,
      }, 'Payment verification mismatch');
      await client.query(
        `UPDATE payments SET status='failed', provider_payload=COALESCE(provider_payload, '{}'::jsonb) || $2::jsonb, updated_at=now() WHERE id=$1`,
        [payment.id, JSON.stringify(providerPayload)],
      );
      return { status: 'failed' };
    }

    await client.query(
      `UPDATE payments
          SET status='successful', paid_at=now(),
              provider_payload=COALESCE(provider_payload, '{}'::jsonb) || $2::jsonb,
              provider_transaction_id=COALESCE($3, provider_transaction_id), updated_at=now()
        WHERE id=$1`,
      [payment.id, JSON.stringify(providerPayload), providerTransactionId ?? null],
    );
    await applyLedgerInTransaction(client, {
      userId: payment.user_id,
      delta: payment.credits_granted,
      eventType: 'purchase',
      reason: `${payment.provider}:${reference}`,
      idempotencyKey: `purchase:${reference}`,
      metadata: { packageCode: payment.package_code, provider: payment.provider },
    });

    logger.info({ reference, provider }, 'Payment granted credits');
    return { status: 'successful', creditsGranted: payment.credits_granted };
  });
}

async function verifyPaystack(payment: PaymentRow): Promise<PaymentConfirmation> {
  const response = await fetch(
    `${env.PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(payment.provider_reference)}`,
    { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` }, signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok) {
    logger.error({ status: response.status, reference: payment.provider_reference }, 'Paystack verification request failed');
    throw Errors.unavailable('Could not verify payment with the provider. Please try again.');
  }
  const verification = objectValue(await response.json());
  const data = objectValue(verification?.data);
  if (verification?.status !== true || !data
    || data.reference !== payment.provider_reference
    || typeof data.status !== 'string'
    || typeof data.amount !== 'number'
    || typeof data.currency !== 'string') {
    throw Errors.unavailable('Payment provider returned incomplete verification details.');
  }
  if (data.status === 'success') {
    return finalizeSuccessfulPayment(
      payment.provider_reference,
      data.amount / (10 ** currencyDecimals(data.currency)),
      data.currency,
      verification,
      'paystack',
    );
  }
  if (data.status === 'failed') {
    await query(
      `UPDATE payments SET status='failed', provider_payload=COALESCE(provider_payload, '{}'::jsonb) || $2::jsonb, updated_at=now()
        WHERE provider_reference=$1 AND status='pending'`,
      [payment.provider_reference, JSON.stringify(verification)],
    );
    return { status: 'failed' };
  }
  return { status: 'pending' };
}

async function verifyFlutterwave(
  payment: PaymentRow,
  transactionId: string,
): Promise<PaymentConfirmation> {
  if (!/^[0-9]{1,20}$/.test(transactionId)) throw Errors.badRequest('Invalid Flutterwave transaction ID.');
  const response = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`, {
    headers: { Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    logger.error({ status: response.status, reference: payment.provider_reference }, 'Flutterwave verification request failed');
    throw Errors.unavailable('Could not verify payment with the provider. Please try again.');
  }
  const verification = objectValue(await response.json());
  const data = objectValue(verification?.data);
  if (verification?.status !== 'success' || !data || data.tx_ref !== payment.provider_reference
    || typeof data.status !== 'string' || typeof data.amount !== 'number' || typeof data.currency !== 'string') {
    throw Errors.unavailable('Payment provider returned incomplete verification details.');
  }
  if (data.status === 'successful') {
    return finalizeSuccessfulPayment(payment.provider_reference, data.amount, data.currency, verification, 'flutterwave', transactionId);
  }
  if (data.status === 'failed') {
    await query(
      `UPDATE payments SET status='failed', provider_transaction_id=$2,
              provider_payload=COALESCE(provider_payload, '{}'::jsonb) || $3::jsonb, updated_at=now()
        WHERE provider_reference=$1 AND status='pending'`,
      [payment.provider_reference, transactionId, JSON.stringify(verification)],
    );
    return { status: 'failed' };
  }
  await query(
    `UPDATE payments SET provider_transaction_id=$2, updated_at=now()
      WHERE provider_reference=$1 AND status='pending' AND provider_transaction_id IS NULL`,
    [payment.provider_reference, transactionId],
  );
  return { status: 'pending' };
}

async function fetchStripeSession(sessionId: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = objectValue(await response.json());
  if (!response.ok || !payload) {
    logger.error({ status: response.status }, 'Stripe session verification failed');
    throw Errors.unavailable('Could not verify payment with the provider. Please try again.');
  }
  return payload;
}

async function verifyStripe(payment: PaymentRow, sessionId: string): Promise<PaymentConfirmation> {
  const session = await fetchStripeSession(sessionId);
  const reference = session.client_reference_id
    ?? objectValue(session.metadata)?.reference;
  if (reference !== payment.provider_reference || typeof session.currency !== 'string'
    || typeof session.amount_total !== 'number' || typeof session.payment_status !== 'string') {
    throw Errors.unavailable('Payment provider returned incomplete verification details.');
  }
  if (session.payment_status === 'paid') {
    return finalizeSuccessfulPayment(
      payment.provider_reference,
      session.amount_total / (10 ** currencyDecimals(payment.currency)),
      session.currency,
      session,
      'stripe',
      sessionId,
    );
  }
  if (session.status === 'expired') {
    await query(
      `UPDATE payments SET status='failed', provider_payload=COALESCE(provider_payload, '{}'::jsonb) || $2::jsonb, updated_at=now()
        WHERE provider_reference=$1 AND status='pending'`,
      [payment.provider_reference, JSON.stringify(session)],
    );
    return { status: 'failed' };
  }
  return { status: 'pending' };
}

export async function verifyPaymentForUser(
  reference: string,
  userId: string,
  providerTransactionId?: string,
): Promise<PaymentConfirmation> {
  const result = await query<PaymentRow>(
    `SELECT id, user_id, provider, provider_reference, provider_transaction_id,
            credits_granted, package_code, amount, currency, status
       FROM payments WHERE provider_reference = $1 AND user_id = $2`,
    [reference, userId],
  );
  const payment = result.rows[0];
  if (!payment) throw Errors.notFound('Payment not found');
  if (payment.status === 'successful') return { status: 'successful', creditsGranted: payment.credits_granted };
  if (payment.status !== 'pending') return { status: payment.status === 'failed' ? 'failed' : 'pending' };

  if (payment.provider === 'paystack') return verifyPaystack(payment);
  if (payment.provider === 'flutterwave') {
    const transactionId = providerTransactionId ?? payment.provider_transaction_id;
    return transactionId ? verifyFlutterwave(payment, transactionId) : { status: 'pending' };
  }
  const sessionId = providerTransactionId ?? payment.provider_transaction_id;
  return sessionId ? verifyStripe(payment, sessionId) : { status: 'pending' };
}

export function verifyPaystackWebhook(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature) return false;
  const computed = hmacSha256Hex(env.PAYSTACK_SECRET_KEY, rawBody.toString('utf8'));
  return safeEqualHex(computed, signature);
}

export function verifyFlutterwaveWebhook(secretHash: string | undefined): boolean {
  const expected = env.FLUTTERWAVE_WEBHOOK_SECRET_HASH;
  if (!expected || !secretHash) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(secretHash);
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function verifyStripeWebhook(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return false;
  const parts = signature.split(',').map((part) => part.split('=', 2));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value)
    .filter((value): value is string => typeof value === 'string');
  if (!timestamp || !/^[0-9]+$/.test(timestamp) || signatures.length === 0) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;
  const expected = hmacSha256Hex(secret, `${timestamp}.${rawBody.toString('utf8')}`);
  return signatures.some((candidate) => safeEqualHex(expected, candidate));
}

export async function handlePaystackWebhook(rawBody: Buffer): Promise<void> {
  const parsed = JSON.parse(rawBody.toString('utf8')) as {
    event: string;
    data: { reference: string; status: string; amount: number; currency: string };
  };
  if (parsed.event !== 'charge.success' || parsed.data.status !== 'success') return;
  const { reference, amount, currency } = parsed.data;
  await finalizeSuccessfulPayment(
    reference,
    amount / (10 ** currencyDecimals(currency)),
    currency,
    parsed,
    'paystack',
  );
}

export async function handleFlutterwaveWebhook(rawBody: Buffer): Promise<void> {
  const parsed = JSON.parse(rawBody.toString('utf8')) as {
    event: string;
    data?: { id?: number; tx_ref?: string; status?: string };
  };
  if (parsed.event !== 'charge.completed' || parsed.data?.status !== 'successful') return;
  if (!parsed.data.tx_ref || !parsed.data.id || !Number.isSafeInteger(parsed.data.id)) {
    logger.warn('Flutterwave payment webhook is missing a valid transaction reference');
    return;
  }
  await verifyFlutterwave(
    {
      id: '',
      user_id: '',
      provider: 'flutterwave',
      provider_reference: parsed.data.tx_ref,
      provider_transaction_id: String(parsed.data.id),
      credits_granted: 0,
      package_code: '',
      amount: '0',
      currency: '',
      status: 'pending',
    },
    String(parsed.data.id),
  );
}

export async function handleStripeWebhook(rawBody: Buffer): Promise<void> {
  const event = objectValue(JSON.parse(rawBody.toString('utf8')));
  const eventType = event?.type;
  if (eventType !== 'checkout.session.completed' && eventType !== 'checkout.session.async_payment_succeeded') return;
  const data = objectValue(event?.data);
  const session = objectValue(data?.object);
  if (!session || typeof session.id !== 'string') return;
  const reference = session.client_reference_id ?? objectValue(session.metadata)?.reference;
  if (typeof reference !== 'string' || session.payment_status !== 'paid') return;

  const verifiedSession = await fetchStripeSession(session.id);
  if (verifiedSession.payment_status !== 'paid'
    || verifiedSession.client_reference_id !== reference && objectValue(verifiedSession.metadata)?.reference !== reference
    || typeof verifiedSession.currency !== 'string' || typeof verifiedSession.amount_total !== 'number') {
    logger.warn({ reference }, 'Stripe webhook did not match a verified paid Checkout Session');
    return;
  }
  const paymentResult = await query<{ currency: string }>(
    `SELECT currency FROM payments WHERE provider_reference=$1 AND provider='stripe'`,
    [reference],
  );
  const currency = paymentResult.rows[0]?.currency;
  if (!currency) {
    logger.warn({ reference }, 'Stripe webhook referenced an unknown payment');
    return;
  }
  await finalizeSuccessfulPayment(
    reference,
    verifiedSession.amount_total / (10 ** currencyDecimals(currency)),
    verifiedSession.currency,
    verifiedSession,
    'stripe',
    session.id,
  );
}

export async function initPayment(args: {
  userId: string;
  email: string;
  packageCode: PackageCode;
}): Promise<InitResult> {
  const currency = PAYMENT_CURRENCIES.find((code) => code === env.PAYSTACK_CURRENCY.toUpperCase());
  if (!currency) throw Errors.unavailable('The configured Paystack currency is not supported.');
  return startPayment({
    ...args,
    provider: 'paystack',
    method: 'card',
    currency,
  });
}
