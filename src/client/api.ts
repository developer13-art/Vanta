import type {
  LoginResponse, AuthUser, BrokerAccount, BrokerSymbol, BotSummary,
  Position, Wallet, LedgerEntry, CreditPackage, Notification,
  Candle, AnalyticsSummary, DailyPnl, ApiError, PackageCode, TradeHistoryEntry,
  BrokerPlatform, BrokerProvider,
} from '../shared/types';

const ACCESS_KEY = 'vanta.access';
const REFRESH_KEY = 'vanta.refresh';

export const tokens = {
  get access(): string | null { return localStorage.getItem(ACCESS_KEY); },
  get refresh(): string | null { return localStorage.getItem(REFRESH_KEY); },
  set(access: string, refresh: string): void {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiRequestError extends Error {
  constructor(public code: string, message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const r = tokens.refresh;
  if (!r) return false;
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: r }),
  });
  if (!res.ok) { tokens.clear(); return false; }
  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  tokens.set(data.accessToken, data.refreshToken);
  return true;
}

async function request<T>(
  path: string,
  opts: Omit<RequestInit, 'body'> & { body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false && tokens.access) {
    headers.Authorization = `Bearer ${tokens.access}`;
  }
  const body = opts.body !== undefined ? JSON.stringify(opts.body) : opts.body;

  let res = await fetch(path, { ...opts, headers: { ...headers, ...(opts.headers as Record<string,string>) }, body: body as BodyInit | undefined });

  if (res.status === 401 && opts.auth !== false && tokens.refresh) {
    if (!refreshing) refreshing = tryRefresh().finally(() => { refreshing = null; });
    const ok = await refreshing;
    if (ok) {
      headers.Authorization = `Bearer ${tokens.access}`;
      res = await fetch(path, { ...opts, headers, body: body as BodyInit | undefined });
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    throw new ApiRequestError(
      err?.code ?? 'UNKNOWN',
      err?.message ?? `Request failed (${res.status})`,
      res.status,
      err?.details,
    );
  }
  return data as T;
}

async function requestBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
  let res = await fetch(path, { headers });

  if (res.status === 401 && tokens.refresh) {
    if (!refreshing) refreshing = tryRefresh().finally(() => { refreshing = null; });
    const ok = await refreshing;
    if (ok) {
      headers.Authorization = `Bearer ${tokens.access}`;
      res = await fetch(path, { headers });
    }
  }

  if (!res.ok) {
    const text = await res.text();
    const data = text ? JSON.parse(text) as ApiError : null;
    const err = data?.error;
    throw new ApiRequestError(
      err?.code ?? 'UNKNOWN',
      err?.message ?? `Request failed (${res.status})`,
      res.status,
      err?.details,
    );
  }
  return res.blob();
}

export const api = {
  // ---- Auth ----
  signup: (body: {
    fullName: string; email: string; password: string; country: string;
    acceptTerms: true; acceptRisk: true;
  }) => request<{ userId: string; accessToken: string }>('/api/auth/signup', { method: 'POST', body, auth: false }),

  login: (body: { email: string; password: string }) =>
    request<LoginResponse>('/api/auth/login', { method: 'POST', body, auth: false }),

  logout: async () => {
    try { await request('/api/auth/logout', { method: 'POST', body: { refreshToken: tokens.refresh } }); }
    catch { /* ignore */ }
    tokens.clear();
  },

  me: () => request<{
    id: string; email: string; full_name: string; country: string;
    email_verified_at: string | null; mfa_enabled: boolean; created_at: string;
  }>('/api/auth/me'),

  verifyEmail: (token: string) =>
    request<{ ok: boolean }>('/api/auth/verify-email', { method: 'POST', body: { token }, auth: false }),

  forgotPassword: (email: string) =>
    request<{ ok: boolean }>('/api/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),

  resetPassword: (token: string, newPassword: string) =>
    request<{ ok: boolean }>('/api/auth/reset-password', { method: 'POST', body: { token, newPassword }, auth: false }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),

  sessions: () => request<Array<{
    id: string; device_label: string | null; ip_address: string | null;
    user_agent: string | null; created_at: string; expires_at: string;
    revoked_at: string | null;
  }>>('/api/auth/sessions'),

  // ---- Brokers ----
  brokerProviders: () => request<{
    providers: Array<{ id: BrokerProvider; label: string; platforms: BrokerPlatform[] }>;
    defaultProvider: BrokerProvider;
  }>('/api/brokers/providers'),
  listBrokers: () => request<BrokerAccount[]>('/api/brokers'),
  getBroker: (id: string) => request<BrokerAccount>(`/api/brokers/${id}`),
  createBroker: (body: {
    label: string; brokerName: string; server: string; login: string;
    password: string; mode: 'demo' | 'live'; platform?: BrokerPlatform; connectionProvider?: BrokerProvider;
  }) => request<{ id: string; status: string }>('/api/brokers', { method: 'POST', body }),
  brokerSymbols: (id: string) => request<BrokerSymbol[]>(`/api/brokers/${id}/symbols`),
  discoverSymbols: (id: string) =>
    request<{ discovered: number }>(`/api/brokers/${id}/discover-symbols`, { method: 'POST' }),
  refreshHealth: (id: string) =>
    request<{ status: string }>(`/api/brokers/${id}/refresh-health`, { method: 'POST' }),
  authorizeLive: (id: string, confirmPhrase: string) =>
    request<{ ok: boolean }>(`/api/brokers/${id}/authorize-live`, { method: 'POST', body: { confirmPhrase } }),
  deleteBroker: (id: string) =>
    request<void>(`/api/brokers/${id}`, { method: 'DELETE' }),

  // ---- Bots ----
  listBots: () => request<BotSummary[]>('/api/bots'),
  getBot: (id: string) => request<{
    bot: BotSummary & {
      broker_account_id: string;
      strategy_params: Record<string, unknown>;
      trading_sessions: Record<string, unknown> | null;
    };
    instruments: Array<{ id: string; broker_symbol: string; canonical_symbol: string; category: string }>;
    openPositions: Position[];
    recentDecisions: Array<{
      id: string; verdict: string; confidence: number | null;
      reasoning_summary: string | null; risk_outcome: string | null;
      risk_reason: string | null; created_at: string;
    }>;
  }>(`/api/bots/${id}`),
  createBot: (body: {
    brokerAccountId: string; name: string; strategyName: string;
    strategyParams: Record<string, unknown>; brokerSymbolIds: string[];
    lotSize: number; entryBatchSize: number; maxConcurrentPositions: number;
    dailyLossLimit: number; drawdownLimit: number; marginUtilizationLimit: number;
    maxSpreadPoints?: number; cooldownSeconds: number; stopBehavior: string;
  }) => request<{ id: string }>('/api/bots', { method: 'POST', body }),
  updateBot: (id: string, body: {
    name: string; brokerSymbolIds: string[]; lotSize: number; entryBatchSize: number;
    maxConcurrentPositions: number; dailyLossLimit: number; drawdownLimit: number;
    marginUtilizationLimit: number; maxSpreadPoints: number | null; cooldownSeconds: number;
    stopBehavior: string;
  }) => request<{ ok: boolean }>(`/api/bots/${id}`, { method: 'PUT', body }),
  startBot: (id: string) => request<{ ok: boolean }>(`/api/bots/${id}/start`, { method: 'POST' }),
  pauseBot: (id: string) => request<{ ok: boolean }>(`/api/bots/${id}/pause`, { method: 'POST' }),
  stopBot: (id: string, action: 'stop_new_manage_existing' | 'close_all_and_stop') =>
    request<{ ok: boolean; mode: string }>(`/api/bots/${id}/stop`, { method: 'POST', body: { action } }),
  deleteBot: (id: string) => request<void>(`/api/bots/${id}`, { method: 'DELETE' }),
  listOpenPositions: () => request<Position[]>('/api/bots/positions/open'),
  closePositions: (positionIds: string[]) =>
    request<{ results: Array<{ positionId: string; ok: boolean; error?: string }> }>(
      '/api/bots/positions/close', { method: 'POST', body: { positionIds } },
    ),
  closeAll: (brokerAccountId: string) =>
    request<{ total: number; succeeded: number; failed: number }>(
      '/api/bots/positions/close-all',
      { method: 'POST', body: { brokerAccountId, confirmPhrase: 'CLOSE ALL' } },
    ),

  // ---- Market ----
  listSymbols: (category?: string) =>
    request<BrokerSymbol[]>(`/api/market/symbols${category ? `?category=${category}` : ''}`),
  getCandles: (symbolId: string, timeframe: '1m' | '5m' | '15m' | '1h') =>
    request<{ timeframe: string; candles: Candle[] }>(`/api/market/symbols/${symbolId}/candles?timeframe=${timeframe}`),

  // ---- Wallet ----
  getWallet: () => request<Wallet>('/api/wallet'),
  getLedger: (limit = 100, offset = 0) =>
    request<LedgerEntry[]>(`/api/wallet/ledger?limit=${limit}&offset=${offset}`),
  listPackages: (currency?: string) =>
    request<CreditPackage[]>(`/api/wallet/packages${currency ? `?currency=${encodeURIComponent(currency)}` : ''}`),
  paymentOptions: () => request<{
    currencies: Array<{
      code: string;
      methods: Array<{ provider: 'paystack' | 'flutterwave' | 'stripe'; method: 'card' | 'bank_transfer'; label: string }>;
    }>;
    ratesUpdatedAt: string;
  }>('/api/wallet/payment-options'),
  publicRates: () => request<{ openOrder: number; closeOrder: number; aiAssessment: number }>('/api/public/rates', { auth: false }),
  purchase: (packageCode: PackageCode, provider: 'paystack' | 'flutterwave' | 'stripe', method: 'card' | 'bank_transfer', currency: string) =>
    request<{ authorizationUrl: string; reference: string }>('/api/wallet/purchase', { method: 'POST', body: { packageCode, provider, method, currency } }),
  verifyPayment: (reference: string, transactionId?: string) =>
    request<
      | { status: 'successful'; creditsGranted: number }
      | { status: 'pending' | 'failed' }
    >(
      '/api/wallet/verify-payment', { method: 'POST', body: { reference, ...(transactionId ? { transactionId } : {}) } },
    ),
  listPayments: () => request<Array<{
    id: string; provider: string; provider_reference: string; provider_transaction_id: string | null; package_code: string;
    credits_granted: number; amount: string; currency: string; status: string;
    paid_at: string | null; created_at: string;
  }>>('/api/wallet/payments'),

  // ---- Notifications ----
  listNotifications: (params?: { category?: string; unreadOnly?: boolean; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.category) q.set('category', params.category);
    if (params?.unreadOnly) q.set('unreadOnly', 'true');
    if (params?.limit) q.set('limit', String(params.limit));
    return request<Notification[]>(`/api/notifications?${q.toString()}`);
  },
  markNotificationRead: (id: string) =>
    request<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' }),
  notificationPreferences: () => request<{
    email_trading: boolean; email_broker: boolean; email_wallet: boolean; email_security: boolean;
  }>('/api/notifications/preferences'),
  updateNotificationPreferences: (prefs: Partial<{
    email_trading: boolean; email_broker: boolean; email_wallet: boolean;
  }>) => request<{ ok: boolean }>('/api/notifications/preferences', { method: 'PATCH', body: prefs }),

  // ---- Settings ----
  getProfile: () => request<{
    id: string; email: string; full_name: string; country: string;
    email_verified_at: string | null; mfa_enabled: boolean; created_at: string;
  }>('/api/settings/profile'),
  updateProfile: (body: { fullName?: string; country?: string }) =>
    request<{ ok: boolean }>('/api/settings/profile', { method: 'PATCH', body }),

  // ---- Analytics ----
  getAnalyticsSummary: (days = 30) =>
    request<AnalyticsSummary>(`/api/analytics/summary?days=${days}`),
  getDailyPnl: (days = 30) =>
    request<DailyPnl[]>(`/api/analytics/daily-pnl?days=${days}`),

  // ---- Trade history ----
  listHistory: (params?: { brokerAccountId?: string; botId?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.brokerAccountId) q.set('brokerAccountId', params.brokerAccountId);
    if (params?.botId) q.set('botId', params.botId);
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    const query = q.toString();
    return request<TradeHistoryEntry[]>(`/api/history${query ? `?${query}` : ''}`);
  },
  exportHistoryCsv: () => requestBlob('/api/history/export/csv'),

  // ---- Admin ----
  adminOverview: () => request<{
    users: { total: string; active: string };
    accounts: { total: string; connected: string; live: string };
    bots: { total: string; running: string };
    credits: { credits_sold: string; credits_used: string };
  }>('/api/admin/overview'),
  adminListUsers: (q = '') =>
    request<Array<{
      id: string; email: string; full_name: string; country: string;
      status: string; created_at: string; email_verified_at: string | null;
      account_count: number; bot_count: number; credits: number | null;
    }>>(`/api/admin/users?q=${encodeURIComponent(q)}`),
  adminSuspendUser: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${id}/suspend`, { method: 'POST' }),
  adminReactivateUser: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${id}/reactivate`, { method: 'POST' }),
  adminEmergencyHalt: (body: {
    scope: 'global' | 'symbol' | 'strategy' | 'user' | 'account' | 'broker';
    scopeId?: string | null;
    action: 'halt_new_entries' | 'halt_all' | 'close_all';
    reason: string;
  }) => request<{ ok: boolean }>('/api/admin/emergency/halt', { method: 'POST', body }),
  adminAuditLog: () => request<Array<{
    id: string; actor_id: string | null; actor_type: string; action: string;
    target_type: string | null; target_id: string | null;
    metadata: Record<string, unknown> | null; created_at: string;
  }>>('/api/admin/audit'),
  adminJobStats: () => request<Array<{ status: string; count: number }>>('/api/admin/jobs'),
};