-- ============================================================================
-- VANTA Trade AI — Complete Database Schema
-- PostgreSQL 15+
-- Run once: psql $DATABASE_URL -f db/schema.sql
-- Idempotent: safe to re-run (all CREATE ... IF NOT EXISTS)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- 1. USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 CITEXT UNIQUE NOT NULL,
  password_hash         TEXT NOT NULL,
  full_name             TEXT NOT NULL,
  country               TEXT NOT NULL,
  email_verified_at     TIMESTAMPTZ,
  mfa_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret            TEXT,                       -- encrypted at app layer
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','suspended','closed')),
  terms_accepted_at     TIMESTAMPTZ NOT NULL,
  risk_accepted_at      TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);

-- Email verification + password reset tokens (single-use, hashed)
CREATE TABLE IF NOT EXISTS auth_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  purpose       TEXT NOT NULL CHECK (purpose IN ('verify_email','reset_password','mfa_challenge')),
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens (user_id, purpose);

-- Refresh tokens (rotating)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  device_label  TEXT,
  ip_address    INET,
  user_agent    TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id)
  WHERE revoked_at IS NULL;

-- Login history for suspicious-activity alerts
CREATE TABLE IF NOT EXISTS login_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address   INET,
  user_agent   TEXT,
  success      BOOLEAN NOT NULL,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_events_user_idx ON login_events (user_id, created_at DESC);

-- ============================================================================
-- 2. BROKER ACCOUNTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS broker_accounts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label                    TEXT NOT NULL,
  broker_name              TEXT NOT NULL,
  server                   TEXT NOT NULL,
  login                    TEXT NOT NULL,
  connection_provider      TEXT NOT NULL DEFAULT 'metaapi',
  provider_account_id      TEXT,
  platform                 TEXT CHECK (platform IN ('mt4','mt5')),
  metaapi_account_id       TEXT UNIQUE,
  -- AES-256-GCM encrypted blob of {password, investorPassword}
  encrypted_credentials    BYTEA,
  -- SHA-256 hash of login+server for dedupe/audit (never the password)
  identity_hash            TEXT NOT NULL,
  mode                     TEXT NOT NULL CHECK (mode IN ('demo','live')),
  status                   TEXT NOT NULL DEFAULT 'connecting'
                           CHECK (status IN (
                             'not_connected','connecting','provisioning','deploying',
                             'connected','disconnected','reconnecting','failed',
                             'requires_attention','undeployed')),
  account_currency         TEXT,
  account_balance          NUMERIC(18,2),
  account_equity           NUMERIC(18,2),
  account_free_margin      NUMERIC(18,2),
  account_used_margin      NUMERIC(18,2),
  account_margin_level     NUMERIC(10,2),
  account_leverage         INT,
  is_hedging               BOOLEAN,
  trading_enabled          BOOLEAN NOT NULL DEFAULT FALSE,   -- live-trading authorization
  live_authorized_at       TIMESTAMPTZ,
  last_health_check_at     TIMESTAMPTZ,
  last_health_status       TEXT,
  last_error               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, broker_name, server, login)
);

ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS connection_provider TEXT NOT NULL DEFAULT 'metaapi';
ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS provider_account_id TEXT;
ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE broker_accounts ALTER COLUMN metaapi_account_id DROP NOT NULL;
ALTER TABLE broker_accounts ALTER COLUMN encrypted_credentials DROP NOT NULL;
UPDATE broker_accounts
   SET provider_account_id = metaapi_account_id
 WHERE provider_account_id IS NULL AND metaapi_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS broker_provider_account_unique_idx
  ON broker_accounts (connection_provider, provider_account_id)
  WHERE provider_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS broker_accounts_user_idx ON broker_accounts (user_id);
CREATE INDEX IF NOT EXISTS broker_accounts_status_idx ON broker_accounts (status);

-- Broker-discovered instrument catalogue per account
CREATE TABLE IF NOT EXISTS broker_symbols (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_account_id UUID NOT NULL REFERENCES broker_accounts(id) ON DELETE CASCADE,
  broker_symbol     TEXT NOT NULL,          -- exact string from broker (e.g. XAUUSDm)
  canonical_symbol  TEXT NOT NULL,          -- normalized (e.g. XAUUSD)
  category          TEXT NOT NULL
                    CHECK (category IN (
                      'forex_major','forex_minor','forex_exotic','metal',
                      'index','energy','crypto_cfd','other')),
  description       TEXT,
  digits            INT,
  tick_size         NUMERIC(18,8),
  tick_value        NUMERIC(18,8),
  contract_size     NUMERIC(18,4),
  min_volume        NUMERIC(12,4),
  max_volume        NUMERIC(12,4),
  volume_step       NUMERIC(12,4),
  trading_sessions  JSONB,
  permitted_order_types JSONB,
  is_tradable       BOOLEAN NOT NULL DEFAULT TRUE,
  discovered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (broker_account_id, broker_symbol)
);

CREATE INDEX IF NOT EXISTS broker_symbols_account_idx ON broker_symbols (broker_account_id);
CREATE INDEX IF NOT EXISTS broker_symbols_canonical_idx ON broker_symbols (canonical_symbol);

-- ============================================================================
-- 3. STRATEGIES & BOTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS strategy_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,                 -- e.g. 'ema_crossover'
  version        TEXT NOT NULL,                 -- e.g. '1.0.0'
  description    TEXT,
  params_schema  JSONB NOT NULL,                -- JSON schema of allowed params
  default_params JSONB NOT NULL,
  eligible_categories TEXT[] NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE TABLE IF NOT EXISTS bots (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker_account_id        UUID NOT NULL REFERENCES broker_accounts(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  strategy_version_id      UUID NOT NULL REFERENCES strategy_versions(id),
  strategy_params          JSONB NOT NULL,
  state                    TEXT NOT NULL DEFAULT 'draft'
                           CHECK (state IN (
                             'draft','configuring','ready','starting','running',
                             'analyzing','executing','managing','paused','stopping',
                             'management_only','reconnecting','error','stopped')),
  -- Trading config
  lot_size                 NUMERIC(12,4) NOT NULL,
  entry_batch_size         INT NOT NULL DEFAULT 1,
  max_concurrent_positions INT NOT NULL DEFAULT 1,
  -- Risk config (bot-level)
  daily_loss_limit         NUMERIC(18,2) NOT NULL,
  drawdown_limit           NUMERIC(18,2) NOT NULL,
  margin_utilization_limit NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  max_spread_points        INT,
  trading_sessions         JSONB,               -- e.g. {"mon":[["08:00","17:00"]]}
  cooldown_seconds         INT NOT NULL DEFAULT 60,
  stop_behavior            TEXT NOT NULL DEFAULT 'stop_new_manage_existing'
                           CHECK (stop_behavior IN (
                             'stop_new_manage_existing','close_all_and_stop','emergency_halt')),
  -- Live/demo
  is_live                  BOOLEAN NOT NULL DEFAULT FALSE,
  started_at               TIMESTAMPTZ,
  stopped_at               TIMESTAMPTZ,
  last_run_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bots_user_idx ON bots (user_id);
CREATE INDEX IF NOT EXISTS bots_account_idx ON bots (broker_account_id);
CREATE INDEX IF NOT EXISTS bots_state_idx ON bots (state);

-- Many-to-many: bot trades multiple instruments
CREATE TABLE IF NOT EXISTS bot_instruments (
  bot_id            UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  broker_symbol_id  UUID NOT NULL REFERENCES broker_symbols(id) ON DELETE CASCADE,
  PRIMARY KEY (bot_id, broker_symbol_id)
);

-- ============================================================================
-- 4. RISK LIMITS (scoped)
-- ============================================================================

CREATE TABLE IF NOT EXISTS risk_limits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope          TEXT NOT NULL CHECK (scope IN ('bot','account','platform')),
  scope_id       UUID,               -- bot.id or broker_accounts.id; NULL for platform
  limit_key      TEXT NOT NULL,      -- e.g. 'max_positions','max_lot','daily_loss'
  limit_value    NUMERIC(18,4) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_id, limit_key)
);

-- ============================================================================
-- 5. ORDERS & POSITIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id             UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  broker_account_id  UUID NOT NULL REFERENCES broker_accounts(id) ON DELETE CASCADE,
  broker_symbol_id   UUID NOT NULL REFERENCES broker_symbols(id),
  idempotency_key    TEXT NOT NULL UNIQUE,
  provider_order_id  TEXT,
  broker_ticket      TEXT,
  side               TEXT NOT NULL CHECK (side IN ('buy','sell')),
  volume             NUMERIC(12,4) NOT NULL,
  requested_price    NUMERIC(18,8),
  filled_price       NUMERIC(18,8),
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN (
                       'pending','submitted','accepted','rejected',
                       'partially_filled','filled','cancelled','failed','unknown')),
  request_payload    JSONB,
  broker_response    JSONB,
  rejection_reason   TEXT,
  submitted_at       TIMESTAMPTZ,
  acknowledged_at    TIMESTAMPTZ,
  filled_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_order_id TEXT;
CREATE INDEX IF NOT EXISTS orders_bot_idx ON orders (bot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_account_idx ON orders (broker_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
CREATE INDEX IF NOT EXISTS orders_ticket_idx ON orders (broker_ticket) WHERE broker_ticket IS NOT NULL;

CREATE TABLE IF NOT EXISTS positions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id              UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  broker_account_id   UUID NOT NULL REFERENCES broker_accounts(id) ON DELETE CASCADE,
  broker_symbol_id    UUID NOT NULL REFERENCES broker_symbols(id),
  opening_order_id    UUID REFERENCES orders(id),
  broker_ticket       TEXT NOT NULL,
  side                TEXT NOT NULL CHECK (side IN ('buy','sell')),
  volume              NUMERIC(12,4) NOT NULL,
  entry_price         NUMERIC(18,8) NOT NULL,
  current_price       NUMERIC(18,8),
  stop_loss           NUMERIC(18,8),
  take_profit         NUMERIC(18,8),
  floating_pl         NUMERIC(18,2),
  commission          NUMERIC(18,2) DEFAULT 0,
  swap                NUMERIC(18,2) DEFAULT 0,
  management_state    TEXT NOT NULL DEFAULT 'platform_managed'
                      CHECK (management_state IN (
                        'platform_managed','manual_override','pending_close','closing')),
  source              TEXT NOT NULL DEFAULT 'platform'
                      CHECK (source IN ('platform','manual_broker')),
  opened_at           TIMESTAMPTZ NOT NULL,
  closed_at           TIMESTAMPTZ,
  close_price         NUMERIC(18,8),
  realized_pl         NUMERIC(18,2),
  closed_by           TEXT,           -- 'platform','user','broker','risk'
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (broker_account_id, broker_ticket)
);

CREATE INDEX IF NOT EXISTS positions_bot_idx ON positions (bot_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS positions_account_idx ON positions (broker_account_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS positions_open_idx ON positions (closed_at) WHERE closed_at IS NULL;

-- ============================================================================
-- 6. AI DECISION RECORDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_decisions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id              UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  broker_symbol_id    UUID NOT NULL REFERENCES broker_symbols(id),
  strategy_version_id UUID NOT NULL REFERENCES strategy_versions(id),
  verdict             TEXT NOT NULL CHECK (verdict IN ('BUY','SELL','HOLD','NO_TRADE')),
  confidence          NUMERIC(5,4),
  reasoning_summary   TEXT,
  structured_output   JSONB NOT NULL,     -- full validated schema output
  risk_outcome        TEXT CHECK (risk_outcome IN ('approved','reduced','rejected')),
  risk_reason         TEXT,
  model_name          TEXT,
  model_version       TEXT,
  input_summary       JSONB,
  latency_ms          INT,
  rejected_by_validator BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_decisions_bot_idx ON ai_decisions (bot_id, created_at DESC);

-- ============================================================================
-- 7. WALLET & LEDGER (append-only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS wallets (
  user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  available_credits   INT NOT NULL DEFAULT 0 CHECK (available_credits >= 0),
  reserved_credits    INT NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  lifetime_purchased  INT NOT NULL DEFAULT 0,
  lifetime_used       INT NOT NULL DEFAULT 0,
  auto_topup_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  auto_topup_threshold INT,
  auto_topup_package  TEXT,
  auto_topup_cap      INT,
  auto_topup_frequency TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta             INT NOT NULL,               -- negative = debit, positive = credit
  balance_after     INT NOT NULL,
  event_type        TEXT NOT NULL
                    CHECK (event_type IN (
                      'purchase','promotional_grant','refund','adjustment',
                      'reversal','charge_open','charge_close',
                      'charge_ai','charge_service','expiry')),
  reason            TEXT NOT NULL,
  bot_id            UUID REFERENCES bots(id),
  broker_account_id UUID REFERENCES broker_accounts(id),
  order_id          UUID REFERENCES orders(id),
  position_id       UUID REFERENCES positions(id),
  rate_version      TEXT,
  idempotency_key   TEXT UNIQUE,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_ledger_user_idx ON credit_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_ledger_bot_idx ON credit_ledger (bot_id) WHERE bot_id IS NOT NULL;

-- Reservations to prevent concurrent bots spending same balance
CREATE TABLE IF NOT EXISTS credit_reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id          UUID REFERENCES bots(id),
  amount          INT NOT NULL CHECK (amount > 0),
  status          TEXT NOT NULL DEFAULT 'reserved'
                  CHECK (status IN ('reserved','consumed','released','expired')),
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  released_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_reservations_active_idx
  ON credit_reservations (user_id, status) WHERE status = 'reserved';

-- ============================================================================
-- 8. PAYMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,                 -- 'paystack', 'flutterwave', 'stripe'
  provider_reference  TEXT NOT NULL UNIQUE,
  provider_transaction_id TEXT,
  package_code        TEXT NOT NULL,
  credits_granted     INT NOT NULL,
  amount              NUMERIC(18,2) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'NGN',
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                        'pending','successful','failed','reversed',
                        'refunded','disputed')),
  provider_payload    JSONB,
  paid_at             TIMESTAMPTZ,
  refunded_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT;
CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);

-- ============================================================================
-- 9. JOB QUEUE (PostgreSQL SKIP LOCKED, no Redis)
-- ============================================================================

CREATE TABLE IF NOT EXISTS jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL CHECK (type IN (
                  'tick_analysis','position_check','reconciliation',
                  'reservation_expiry','notification_dispatch','broker_health_check')),
  payload       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','done','failed')),
  run_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 3,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_pending_idx ON jobs (run_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS jobs_running_idx ON jobs (claimed_at)
  WHERE status = 'running';

-- ============================================================================
-- 10. NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN (
                'trading','broker','wallet','security','system')),
  severity    TEXT NOT NULL DEFAULT 'info'
              CHECK (severity IN ('info','warning','critical')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  action_url  TEXT,
  read_at     TIMESTAMPTZ,
  emailed_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_trading        BOOLEAN NOT NULL DEFAULT TRUE,
  email_broker         BOOLEAN NOT NULL DEFAULT TRUE,
  email_wallet         BOOLEAN NOT NULL DEFAULT TRUE,
  email_security       BOOLEAN NOT NULL DEFAULT TRUE,
  -- critical safety notices cannot be disabled
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 11. ADMIN & AUDIT
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_users (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('super_admin','ops','support','read_only')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES users(id),
  actor_type   TEXT NOT NULL CHECK (actor_type IN ('user','admin','system')),
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    UUID,
  metadata     JSONB,
  ip_address   INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_target_idx ON audit_log (target_type, target_id);

-- Emergency kill switches
CREATE TABLE IF NOT EXISTS emergency_controls (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         TEXT NOT NULL CHECK (scope IN ('global','symbol','strategy','user','account','broker')),
  scope_id      UUID,
  action        TEXT NOT NULL CHECK (action IN ('halt_new_entries','halt_all','close_all')),
  reason        TEXT NOT NULL,
  activated_by  UUID NOT NULL REFERENCES users(id),
  activated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS emergency_controls_active_idx
  ON emergency_controls (scope, scope_id) WHERE deactivated_at IS NULL;

-- ============================================================================
-- 12. JOB SCHEDULING FORMS (bot tick triggers)
-- ============================================================================

-- Idempotent seed: ensure at least one strategy version exists
INSERT INTO strategy_versions (name, version, description, params_schema, default_params, eligible_categories)
VALUES (
  'ema_crossover',
  '1.0.0',
  'EMA fast/slow crossover with trend confirmation',
  '{"type":"object","properties":{"fastPeriod":{"type":"integer","minimum":2},"slowPeriod":{"type":"integer","minimum":5},"minSpreadPoints":{"type":"integer","minimum":0}}}'::jsonb,
  '{"fastPeriod":9,"slowPeriod":21,"minSpreadPoints":30}'::jsonb,
  ARRAY['forex_major','forex_minor','metal','index']
)
ON CONFLICT (name, version) DO NOTHING;

ALTER TABLE risk_limits DROP CONSTRAINT IF EXISTS risk_limits_scope_scope_id_limit_key_key;
ALTER TABLE risk_limits ADD CONSTRAINT risk_limits_scope_scope_id_limit_key_key
  UNIQUE NULLS NOT DISTINCT (scope, scope_id, limit_key);

-- ============================================================================
-- END
-- ============================================================================