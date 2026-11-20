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

- Build: `npm run build`
- Run: `npm start` (serves the API; serve `dist/client` via a static host or Express static middleware — see docs)