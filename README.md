# VANTA Trade AI

Cloud-hosted autonomous AI trading platform for users' own MT4/MT5 broker accounts.

## Stack

- TypeScript, React, Express, PostgreSQL
- No Redis, no workers, no message brokers — PostgreSQL `SKIP LOCKED` job queue inside the main process
- MetaApi for broker connectivity

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
- **Job queue** is a single `jobs` table. The scheduler is one `setInterval` in the Express process. No external queue.
- **Payments** use signed Paystack webhooks with raw-body verification. Credits are never granted based on browser state.

## Testing

`npm test` runs unit tests for the risk engine, billing, and auth helpers.

## Deployment

- Build: `npm run build` (outputs the API bundle to `dist/server` and the frontend to `dist/client`)
- Run: `npm start` (runs the API; publish `dist/client` separately with a static host)