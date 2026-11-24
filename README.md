# VANTA Trade AI

Cloud-hosted autonomous AI trading platform for users' own MT4/MT5 broker accounts.

## Stack

- TypeScript, React, Express, PostgreSQL
- No Redis, no workers, no message brokers — PostgreSQL `SKIP LOCKED` job queue inside the main process
- MetaApi and FXAPIs for broker connectivity

## Requirements

- Node.js 20+
- PostgreSQL 15+
- MetaApi token, Paystack keys, SMTP credentials

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in the values
3. Create a PostgreSQL database locally or with a hosted provider, then set its connection URL as `DATABASE_URL` in `.env`
4. `npm run db:init`
5. `npm run dev`

The server runs on `http://localhost:4000`, the client on `http://localhost:5173` with proxy.

## First Admin Account

1. Sign up using the account you want to administer the app, then verify its email.
2. With the database configured, run `npm run admin:bootstrap -- admin@example.com`, replacing the email with that account's address.
3. Log out and back in, then open `/admin/overview`.

This command only grants the first admin role and refuses to run if an admin already exists. It does not create shared default credentials; use the password you chose during signup.

## Key Design Notes

- **Broker credentials** are encrypted with AES-256-GCM at rest and never exposed to the browser, logs, or admin views.
- **Order submission** uses a unique `idempotency_key` per order. Duplicate submissions are impossible by database constraint.
- **Billing** happens only after broker-confirmed acceptance. Rejected orders and internal retries are free.
- **Risk engine** is independent from AI. AI cannot override limits.
- **Job queue** is a single `jobs` table. The Express process drains queued work and schedules due bot ticks; no external queue is required.
- **Bot analysis** evaluates closed 5-minute candles and stores a decision for each instrument. BUY/SELL signals may submit broker orders only when the account and symbol are tradable, risk checks pass, and live trading has been explicitly authorized. The Bots page refreshes recent feedback automatically.
- **Payments** support Paystack, Flutterwave, and Stripe Checkout, with available options determined by configured credentials and currencies. Flutterwave and Stripe require signed webhook secrets; Stripe bank transfers must also be enabled in the Stripe dashboard. Payment amounts are converted from the USD package prices using the configured daily exchange-rate feed and stored with each payment. Credits are granted only after provider-side verification.
- **Broker connections** support MetaApi for MT4 and MT5, plus FXAPIs for MT5 account connections, trading, and broker-provided candles. When `FXAPIS_API_KEY` is configured, it is the default provider for new MT5 connections; users can select MetaApi instead. MT4 accounts continue to use MetaApi.

### Payment Provider Setup

- Paystack remains configured with `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, and `PAYSTACK_CURRENCY`.
- To enable Flutterwave, set `FLUTTERWAVE_SECRET_KEY` and `FLUTTERWAVE_WEBHOOK_SECRET_HASH`, then configure the Flutterwave webhook URL as `https://<your-domain>/api/payments/webhook/flutterwave`.
- To enable Stripe, set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, then configure the Stripe webhook URL as `https://<your-domain>/api/payments/webhook/stripe`. Subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
- Stripe bank transfers are offered only for currencies in `STRIPE_BANK_TRANSFER_CURRENCIES`; enable bank transfers for the Stripe account in its dashboard as well. Stripe account and country eligibility still applies.
- `FLUTTERWAVE_CURRENCIES` should list only currencies enabled for the merchant account. `PAYMENT_FX_API_URL` defaults to ExchangeRate-API's free daily USD feed.
- To enable FXAPIs, set the server-side `FXAPIS_API_KEY` from the [FXAPIs dashboard](https://fxapis.com/dashboard/keys). Keep the key out of client code. FXAPIs supports MT5 only; MetaApi remains the provider for MT4 and can also be chosen for MT5. FXAPIs accounts default to `warm_on_demand`; set `FXAPIS_ACCOUNT_MODE=always_on` only if the workspace plan includes always-on accounts.
- Run `npm run db:init` after updating to apply the bot tick, equity-baseline, payment, and broker-provider schema changes.

## Testing

`npm test` runs unit tests for the risk engine, billing, and auth helpers.

## Deployment

- Build: `npm run build` (outputs the API bundle to `dist/server` and the frontend to `dist/client`)
- Run: `npm start` (serves the API and built frontend from the same origin)