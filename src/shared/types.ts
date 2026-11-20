// Shared types between frontend and backend.
// These MUST match what the server returns (see src/server/routes/*).

export type BrokerMode = 'demo' | 'live';

export type BrokerStatus =
  | 'not_connected' | 'connecting' | 'provisioning' | 'deploying'
  | 'connected' | 'disconnected' | 'reconnecting' | 'failed'
  | 'requires_attention' | 'undeployed';

export type BotState =
  | 'draft' | 'configuring' | 'ready' | 'starting' | 'running'
  | 'analyzing' | 'executing' | 'managing' | 'paused' | 'stopping'
  | 'management_only' | 'reconnecting' | 'error' | 'stopped';

export type InstrumentCategory =
  | 'forex_major' | 'forex_minor' | 'forex_exotic' | 'metal'
  | 'index' | 'energy' | 'crypto_cfd' | 'other';

export type PositionManagementState =
  | 'platform_managed' | 'manual_override' | 'pending_close' | 'closing';

export type PositionSource = 'platform' | 'manual_broker';

export type LedgerEventType =
  | 'purchase' | 'promotional_grant' | 'refund' | 'adjustment'
  | 'reversal' | 'charge_open' | 'charge_close' | 'charge_ai'
  | 'charge_service' | 'expiry';

export type NotificationCategory = 'trading' | 'broker' | 'wallet' | 'security' | 'system';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export type PaymentStatus =
  | 'pending' | 'successful' | 'failed' | 'reversed' | 'refunded' | 'disputed';

export type AiVerdict = 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE';

export type PackageCode =
  | 'starter' | 'basic' | 'trader' | 'pro'
  | 'advanced' | 'expert' | 'elite';

export type StopBehavior =
  | 'stop_new_manage_existing' | 'close_all_and_stop' | 'emergency_halt';

// ---- API shapes ----

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  country: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; emailVerified: boolean; roles: string[] };
}

export interface BrokerAccount {
  id: string;
  label: string;
  broker_name: string;
  server: string;
  login: string;
  mode: BrokerMode;
  status: BrokerStatus;
  account_currency: string | null;
  account_balance: string | null;
  account_equity: string | null;
  account_free_margin: string | null;
  account_used_margin: string | null;
  account_margin_level: string | null;
  account_leverage: number | null;
  is_hedging: boolean | null;
  trading_enabled: boolean;
  last_health_check_at: string | null;
  last_health_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrokerSymbol {
  id: string;
  broker_symbol: string;
  canonical_symbol: string;
  category: InstrumentCategory;
  description: string | null;
  digits: number | null;
  min_volume: string | null;
  max_volume: string | null;
  volume_step: string | null;
  is_tradable: boolean;
}

export interface BotSummary {
  id: string;
  name: string;
  state: BotState;
  is_live: boolean;
  lot_size: string;
  entry_batch_size: number;
  max_concurrent_positions: number;
  daily_loss_limit: string;
  drawdown_limit: string;
  margin_utilization_limit: string;
  max_spread_points: number | null;
  cooldown_seconds: number;
  stop_behavior: StopBehavior;
  strategy_name: string;
  strategy_version: string;
  broker_account_label: string;
  broker_mode: BrokerMode;
  open_positions: number;
  instrument_count: number;
  started_at: string | null;
  stopped_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  broker_ticket: string;
  side: 'buy' | 'sell';
  volume: string;
  entry_price: string;
  current_price: string | null;
  floating_pl: string | null;
  opened_at: string;
  management_state: PositionManagementState;
  source: PositionSource;
  bot_id: string;
  bot_name: string;
  broker_symbol: string;
  canonical_symbol: string;
  broker_account_id: string;
  broker_account_label: string;
}

export interface Wallet {
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
}

export interface LedgerEntry {
  id: string;
  delta: number;
  balance_after: number;
  event_type: LedgerEventType;
  reason: string;
  bot_id: string | null;
  broker_account_id: string | null;
  order_id: string | null;
  position_id: string | null;
  rate_version: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface CreditPackage {
  code: PackageCode;
  credits: number;
  priceUsd: number;
  priceNgn: number;
}

export interface Notification {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface TradeHistoryEntry {
  id: string;
  broker_ticket: string;
  canonical_symbol: string;
  side: string;
  volume: string;
  entry_price: string;
  close_price: string | null;
  realized_pl: string | null;
  opened_at: string;
  closed_at: string | null;
  bot_name: string;
  broker_account_label: string;
  credit_events: Array<{ event_type: string; delta: number; created_at: string }>;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface AnalyticsSummary {
  days: number;
  pnl: {
    realized: string;
    wins: string;
    losses: string;
    total: string;
    avg_win: string;
    avg_loss: string;
    largest_win: string;
    largest_loss: string;
  };
  creditsUsed: number;
}

export interface DailyPnl {
  day: string;
  pnl: string;
  trades: number;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}