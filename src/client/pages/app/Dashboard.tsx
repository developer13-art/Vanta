import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth-context';
import { Icon } from '../../components/Icon';
import { formatDailyPnlDate } from './Performance';
import { BotStateBadge } from '../../components/BotStateBadge';
import type {
  AnalyticsSummary, BotSummary, BrokerAccount, BrokerSymbol, DailyPnl,
  Notification, Position, Wallet,
} from '../../../shared/types';

const periods = [
  { label: '1D', days: 1 },
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '1Y', days: 365 },
  { label: 'ALL', days: 'all' as const },
];

function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatSigned(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value))}`;
}

function formatName(fullName: string | null, email: string | null): string {
  const name = (fullName?.trim() || (email?.split('@')[0] ?? '').replace(/[._-]+/g, ' ')).trim();
  return name
    ? name.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : 'Trader';
}

function PerformanceChart({ data, days }: { data: DailyPnl[]; days: number | 'all' }): JSX.Element {
  const values = useMemo(() => {
    let total = 0;
    return data.map((item) => {
      total += Number(item.pnl);
      return { day: item.day, value: total };
    });
  }, [data]);

  const width = 720;
  const height = 224;
  const left = 54;
  const right = 704;
  const top = 18;
  const bottom = 183;
  const minValue = Math.min(0, ...values.map((item) => item.value));
  const maxValue = Math.max(0, ...values.map((item) => item.value));
  const span = maxValue - minValue || 1;
  const zeroY = bottom - ((0 - minValue) / span) * (bottom - top);
  const slotWidth = values.length ? (right - left) / values.length : 0;
  const points = values.map((item, index) => ({
    x: left + slotWidth * (index + 0.5),
    y: bottom - ((item.value - minValue) / span) * (bottom - top),
  }));
  const bars = points.map((point, index) => ({
    x: point.x,
    y: Math.min(zeroY, point.y),
    height: Math.max(2, Math.abs(zeroY - point.y)),
    width: Math.min(36, slotWidth * 0.58),
    positive: (values[index]?.value ?? 0) >= 0,
  }));
  const dateIndexes = [0, Math.floor((values.length - 1) / 2), values.length - 1]
    .filter((index, position, all) => index >= 0 && all.indexOf(index) === position);
  const labels = [0, 1, 2, 3].map((index) => minValue + ((maxValue - minValue) * index) / 3);

  return (
    <div className="dashboard-chart">
      <svg
        className="dashboard-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={days === 'all' ? 'Cumulative realized profit and loss for all recorded history' : `Cumulative realized profit and loss for the last ${days} days`}
      >
        {labels.map((value, index) => {
          const y = top + ((bottom - top) * index) / 3;
          return (
            <g key={index}>
              <line className="chart-gridline" x1={left} x2={right} y1={y} y2={y} />
              <text className="chart-axis-label" x="0" y={y + 4}>{formatNumber(maxValue - ((maxValue - minValue) * index) / 3, 0)}</text>
            </g>
          );
        })}
        {[0, 1, 2, 3, 4].map((index) => {
          const x = left + ((right - left) * index) / 4;
          return (
            <line key={index} className="chart-gridline chart-gridline-vertical" x1={x} x2={x} y1={top} y2={bottom} />
          );
        })}
        <line className="chart-zero-line" x1={left} x2={right} y1={zeroY} y2={zeroY} />
        {bars.map((bar, index) => (
          <rect
            className={bar.positive ? 'chart-bar chart-bar-positive' : 'chart-bar chart-bar-negative'}
            key={values[index]?.day ?? index}
            x={bar.x - bar.width / 2}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx="2"
          />
        ))}
        {dateIndexes.map((index) => {
          const value = values[index];
          const point = points[index];
          if (!value || !point) return null;
          return <text key={index} className="chart-date-label" x={point.x} y="216" textAnchor={index === 0 ? 'start' : index === values.length - 1 ? 'end' : 'middle'}>{formatDailyPnlDate(value.day, days === 'all' ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' })}</text>;
        })}
        {points.length === 0 && (
          <text className="chart-empty-label" x={(left + right) / 2} y="104" textAnchor="middle">
            No closed trades in this period
          </text>
        )}
      </svg>
      <div className="chart-footnote">
        <span>{days === 'all' ? 'All time' : `${days} day${days === 1 ? '' : 's'}`}</span>
        <span>Cumulative realized P/L</span>
      </div>
    </div>
  );
}

type MarketFilter = 'forex' | 'metal' | 'index' | 'crypto' | 'more';

function sumBrokerField(accounts: BrokerAccount[], field: 'account_balance' | 'account_equity' | 'account_free_margin' | 'account_used_margin', multipleCurrencies: boolean): string {
  if (accounts.length === 0) return '—';
  if (multipleCurrencies) return 'Multiple';
  const firstAccount = accounts[0];
  if (!firstAccount) return '—';
  const currency = firstAccount.account_currency;
  if (!currency || accounts.some((account) => account.account_currency !== currency || account[field] === null)) return '—';
  const amounts = accounts.map((account) => Number(account[field]));
  if (amounts.some((amount) => !Number.isFinite(amount))) return '—';
  return formatNumber(amounts.reduce((sum, amount) => sum + amount, 0));
}

function getMarketGroup(category: BrokerSymbol['category']): MarketFilter | 'other' {
  if (category.startsWith('forex_')) return 'forex';
  if (category === 'metal') return 'metal';
  if (category === 'index') return 'index';
  if (category === 'crypto_cfd') return 'crypto';
  return 'more';
}

function marketLabel(category: BrokerSymbol['category']): string {
  const group = getMarketGroup(category);
  if (group === 'forex') return 'Forex';
  if (group === 'metal') return 'Metals';
  if (group === 'index') return 'Indices';
  if (group === 'crypto') return 'Crypto';
  return category === 'energy' ? 'Energy' : 'Other';
}

function Dashboard(): JSX.Element {
  const { email, fullName } = useAuth();
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [symbols, setSymbols] = useState<BrokerSymbol[]>([]);
  const [dailyPnl, setDailyPnl] = useState<DailyPnl[]>([]);
  const [todayDailyPnl, setTodayDailyPnl] = useState<DailyPnl[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('forex');
  const [days, setDays] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [performanceLoading, setPerformanceLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [performanceError, setPerformanceError] = useState(false);
  const [historySyncWarning, setHistorySyncWarning] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api.listBrokers(),
      api.listBots(),
      api.listOpenPositions(),
      api.getWallet(),
      api.listNotifications({ unreadOnly: true, limit: 6 }),
      api.listSymbols(),
    ]).then(([brokerResult, botResult, positionResult, walletResult, notificationResult, symbolResult]) => {
      if (!active) return;
      let failed = false;
      if (brokerResult.status === 'fulfilled') setBrokers(brokerResult.value);
      else failed = true;
      if (botResult.status === 'fulfilled') setBots(botResult.value);
      else failed = true;
      if (positionResult.status === 'fulfilled') setPositions(positionResult.value);
      else failed = true;
      if (walletResult.status === 'fulfilled') setWallet(walletResult.value);
      else failed = true;
      if (notificationResult.status === 'fulfilled') setNotifications(notificationResult.value);
      else failed = true;
      if (symbolResult.status === 'fulfilled') {
        setSymbols(symbolResult.value);
        if (!symbolResult.value.some((symbol) => symbol.category.startsWith('forex_'))) {
          const firstSymbol = symbolResult.value[0];
          const firstGroup = firstSymbol ? getMarketGroup(firstSymbol.category) : 'forex';
          setMarketFilter(firstGroup === 'other' ? 'more' : firstGroup);
        }
      } else failed = true;
      setLoadError(failed);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshBots = async () => {
      try {
        const latestBots = await api.listBots();
        if (active) setBots(latestBots);
      } catch {
        if (active) setLoadError(true);
      }
    };
    const timer = window.setInterval(() => { void refreshBots(); }, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setPerformanceLoading(true);
    setPerformanceError(false);
    setHistorySyncWarning(false);
    const loadPerformance = async () => {
      try {
        const syncResult = await api.syncTradeHistory();
        if (active && syncResult.failedAccounts > 0) setHistorySyncWarning(true);
      } catch {
        if (active) setHistorySyncWarning(true);
      }
      return Promise.allSettled([
        api.getAnalyticsSummary(days),
        api.getDailyPnl(days),
        api.getDailyPnl(1),
      ]);
    };
    void loadPerformance().then(([summaryResult, dailyResult, todayResult]) => {
      if (!active) return;
      if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value);
      if (dailyResult.status === 'fulfilled') setDailyPnl(dailyResult.value);
      if (todayResult.status === 'fulfilled') setTodayDailyPnl(todayResult.value);
      setPerformanceError(
        summaryResult.status === 'rejected' || dailyResult.status === 'rejected' || todayResult.status === 'rejected',
      );
      setPerformanceLoading(false);
    });
    return () => { active = false; };
  }, [days]);

  const name = formatName(fullName, email);
  const runningBots = bots.filter((bot) => bot.state === 'running');
  const connectedBrokers = brokers.filter((broker) => broker.status === 'connected');
  const liveBrokers = connectedBrokers.filter((broker) => broker.mode === 'live').length;
  const demoBrokers = connectedBrokers.length - liveBrokers;
  const accountCurrencies = [...new Set(connectedBrokers.map((broker) => broker.account_currency).filter((value): value is string => !!value))];
  const pnlCurrencies = [...new Set(brokers.map((broker) => broker.account_currency).filter((value): value is string => !!value))];
  const multipleAccountCurrencies = accountCurrencies.length > 1;
  const multipleCurrencies = pnlCurrencies.length > 1;
  const pnlCurrencyUnknown = brokers.some((broker) => !broker.account_currency);
  const pnlCurrencyUnavailable = multipleCurrencies || pnlCurrencyUnknown;
  const accountBalance = sumBrokerField(connectedBrokers, 'account_balance', multipleAccountCurrencies);
  const accountEquity = sumBrokerField(connectedBrokers, 'account_equity', multipleAccountCurrencies);
  const freeMargin = sumBrokerField(connectedBrokers, 'account_free_margin', multipleAccountCurrencies);
  const usedMargin = sumBrokerField(connectedBrokers, 'account_used_margin', multipleAccountCurrencies);
  const equityCaption = multipleAccountCurrencies ? 'Mixed currencies · not combined'
    : accountCurrencies[0] ?? (connectedBrokers.length ? 'Currency unavailable' : 'Connect an account');
  const today = todayDailyPnl.find((item) => new Date(item.day).toDateString() === new Date().toDateString());
  const todayPnl = Number(today?.pnl ?? 0);
  const realizedPnl = Number(summary?.pnl.realized ?? 0);
  const wins = Number(summary?.pnl.wins ?? 0);
  const losses = Number(summary?.pnl.losses ?? 0);
  const totalTrades = Number(summary?.pnl.total ?? 0);
  const avgWin = Number(summary?.pnl.avg_win ?? 0);
  const avgLoss = Math.abs(Number(summary?.pnl.avg_loss ?? 0));
  const winRate = totalTrades > 0 ? `${Math.round(wins / totalTrades * 100)}%` : '—';
  const profitFactor = losses > 0 && avgLoss > 0 && !pnlCurrencyUnavailable
    ? formatNumber((avgWin * wins) / (avgLoss * losses))
    : '—';
  const visibleSymbols = symbols.filter((symbol) => {
    if (marketFilter === 'more') return getMarketGroup(symbol.category) === 'more';
    return getMarketGroup(symbol.category) === marketFilter;
  }).slice(0, 5);
  const visibleSymbolsAllReadOnly = visibleSymbols.length > 0 && visibleSymbols.every((symbol) => !symbol.is_tradable);
  const dashboardBots = [...runningBots, ...bots.filter((bot) => bot.state !== 'running')].slice(0, 3);
  const latestNotification = notifications[0];
  const notificationCount = notifications.length > 5 ? '5+' : String(notifications.length);
  const pnlUnavailable = performanceError || pnlCurrencyUnavailable;
  const pnlValue = performanceLoading ? '—'
    : performanceError ? '—'
      : multipleCurrencies ? 'Multiple currencies'
        : pnlCurrencyUnknown ? 'Currency unavailable'
        : formatSigned(realizedPnl);

  if (loading) {
    return <div className="dashboard-loading"><span className="dashboard-spinner" /> Loading your dashboard…</div>;
  }

  return (
    <div className="dashboard-page">
      {loadError && <div className="dashboard-alert" role="status">Some dashboard information could not be loaded. Check your connection and refresh to try again.</div>}

      <Link to="/app/settings" className="dashboard-mobile-profile">
        <span className="dashboard-mobile-avatar">{name.split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1)).join('').toUpperCase()}</span>
        <span><strong>{name}</strong><small>Trader account</small></span>
        <Icon name="arrow-right" size={15} />
      </Link>

      <section className="dashboard-hero">
        <div className="dashboard-welcome dashboard-panel">
          <div className="welcome-robot-art" aria-hidden="true">
            <svg viewBox="0 0 220 170">
              <defs>
                <linearGradient id="robotMetal" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#f3d37a" />
                  <stop offset="43%" stopColor="#9b7a39" />
                  <stop offset="100%" stopColor="#302719" />
                </linearGradient>
              </defs>
              <path className="robot-shoulders" d="M37 163c5-34 25-53 68-56 44 3 65 22 70 56z" />
              <path className="robot-neck" d="M91 114V94h29v21" />
              <path className="robot-head" d="M75 41c3-15 14-24 31-24s28 9 31 24l-4 49c-2 17-13 27-27 27S81 107 79 90z" />
              <path className="robot-face" d="M86 50c2-9 9-14 20-14s18 5 20 14l-2 34c-1 12-8 19-18 19s-17-7-18-19z" />
              <path className="robot-eye" d="M94 66h8m12 0h8" />
              <path className="robot-mouth" d="M101 86h12" />
              <path className="robot-ear" d="M75 57h-8v23h10m60-23h8v23h-10" />
              <path className="robot-antenna" d="M106 17V8m0 0h13" />
              <path className="robot-chart" d="M14 125V96m13 29V80m13 45V102m13 23V69m13 56V88" />
            </svg>
          </div>
          <div className="welcome-graphic" aria-hidden="true">
            <svg viewBox="0 0 150 110">
              <g className="welcome-candles">
                <path d="M14 83V67m17 18V48m17 37V60m17 25V37m17 48V51m17 34V27m17 58V41" />
                <path className="welcome-candle-bodies" d="M9 73h10m12-17h10m12 10h10m12-22h10m12 13h10m12-25h10" />
              </g>
              <path d="m8 91 29-20 18 10 25-36 20 13 29-38" />
              <path d="M119 20h12v12" />
            </svg>
          </div>
          <div className="welcome-copy">
            <span className="dashboard-eyebrow">YOUR TRADING OVERVIEW</span>
            <h1>Welcome back, <em>{name}</em>!</h1>
            <p>Trade smarter with VANTA Trade AI</p>
            <div className={`welcome-connection${connectedBrokers.length ? ' is-connected' : ''}`}>
              <i />{connectedBrokers.length ? `${connectedBrokers.length} connected account${connectedBrokers.length === 1 ? '' : 's'}` : 'Your trading journey starts here'}
            </div>
            <Link to="/app/markets" className="gold-button">Explore Markets <Icon name="arrow-right" size={14} /></Link>
          </div>
        </div>

        <section className="dashboard-account-overview dashboard-panel" aria-label="Account overview">
          <div className="dashboard-section-heading">
            <div><h2>Account Overview</h2><p>Broker-reported snapshot</p></div>
            <Link to="/app/brokers" className="text-link">View details <Icon name="arrow-right" size={13} /></Link>
          </div>
          <div className="account-equity-main">
            <span>Account equity</span>
            <strong>{accountEquity === '—' ? '—' : `${accountEquity}${multipleAccountCurrencies ? '' : ` ${accountCurrencies[0] ?? ''}`}`}</strong>
            <small>{equityCaption}</small>
          </div>
          <div className="account-overview-values">
            <div><span>Balance</span><strong>{accountBalance === '—' || multipleAccountCurrencies ? accountBalance : `${accountBalance} ${accountCurrencies[0] ?? ''}`}</strong></div>
            <div><span>Free margin</span><strong>{freeMargin === '—' || multipleAccountCurrencies ? freeMargin : `${freeMargin} ${accountCurrencies[0] ?? ''}`}</strong></div>
            <div><span>Used margin</span><strong>{usedMargin === '—' || multipleAccountCurrencies ? usedMargin : `${usedMargin} ${accountCurrencies[0] ?? ''}`}</strong></div>
          </div>
          {!connectedBrokers.length && <Link to="/app/brokers/new" className="account-connect-link">Connect an account <Icon name="arrow-right" size={13} /></Link>}
        </section>
      </section>

      <section className="dashboard-mobile-finance" aria-label="Wallet and performance summary">
        <article className="mobile-finance-credit">
          <span className="metric-icon gold-icon"><Icon name="credits" size={23} /></span>
          <div><span>Available Credits</span><strong>{wallet?.available_credits.toLocaleString() ?? '—'}</strong><small>VANTA credits</small></div>
          <Link to="/app/wallet#buy-credits" className="gold-button">Buy <Icon name="arrow-right" size={13} /></Link>
        </article>
        <article className="mobile-finance-pnl">
          <div><span>Portfolio P/L · {days}D</span><strong className={!pnlUnavailable && realizedPnl >= 0 ? 'positive-value' : pnlUnavailable ? '' : 'negative-value'}>{pnlValue}</strong></div>
          <div className="performance-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        </article>
      </section>

      <section className="dashboard-mobile-account-overview dashboard-account-overview dashboard-panel" aria-label="Account overview">
        <div className="dashboard-section-heading">
          <div><h2>Account Overview</h2><p>Broker-reported snapshot</p></div>
          <Link to="/app/brokers" className="text-link">View details <Icon name="arrow-right" size={13} /></Link>
        </div>
        <div className="account-equity-main">
          <span>Account equity</span>
          <strong>{accountEquity === '—' ? '—' : `${accountEquity}${multipleAccountCurrencies ? '' : ` ${accountCurrencies[0] ?? ''}`}`}</strong>
          <small>{equityCaption}</small>
        </div>
        <div className="account-overview-values">
          <div><span>Balance</span><strong>{accountBalance === '—' || multipleAccountCurrencies ? accountBalance : `${accountBalance} ${accountCurrencies[0] ?? ''}`}</strong></div>
          <div><span>Free margin</span><strong>{freeMargin === '—' || multipleAccountCurrencies ? freeMargin : `${freeMargin} ${accountCurrencies[0] ?? ''}`}</strong></div>
          <div><span>Used margin</span><strong>{usedMargin === '—' || multipleAccountCurrencies ? usedMargin : `${usedMargin} ${accountCurrencies[0] ?? ''}`}</strong></div>
        </div>
        {!connectedBrokers.length && <Link to="/app/brokers/new" className="account-connect-link">Connect an account <Icon name="arrow-right" size={13} /></Link>}
      </section>

      <section className="dashboard-mobile-bots dashboard-panel bots-panel" aria-label="AI bots">
        <div className="dashboard-section-heading">
          <div><h2>AI Bots</h2><p>{runningBots.length} running · {bots.length} total</p></div>
          <Link to="/app/bots" className="text-link">View all <Icon name="arrow-right" size={13} /></Link>
        </div>
        {dashboardBots.length === 0 ? (
          <div className="dashboard-empty compact-empty">
            <p>No bots yet. Create a bot to start building your trading workspace.</p>
            <Link to="/app/bots/new">Create an AI bot <Icon name="arrow-right" size={13} /></Link>
          </div>
        ) : (
          <div className="bot-list">
            {dashboardBots.map((bot) => (
              <div className="bot-row" key={bot.id}>
                <span className={`bot-avatar${bot.state === 'running' ? ' bot-avatar-active' : ''}`}><Icon name="bot" size={18} /></span>
                <span className="bot-info">
                  <strong>{bot.name}</strong>
                  <small>{bot.strategy_name === 'ai_adaptive' ? 'AI Adaptive' : bot.strategy_name}<i />{bot.open_positions} open position{bot.open_positions === 1 ? '' : 's'}</small>
                  <small className="bot-feedback">{bot.last_decision_summary ?? (bot.state === 'running' ? 'Waiting for first analysis' : 'No analysis yet')}</small>
                </span>
                <BotStateBadge state={bot.state} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-metrics" aria-label="Account summary">
        <article className="dashboard-stat-card dashboard-panel desktop-stat">
          <span className="metric-icon gold-icon"><Icon name="credits" size={22} /></span>
          <div><span className="metric-label">Credits Balance</span><strong>{wallet?.available_credits.toLocaleString() ?? '—'}</strong><small>Available to use</small></div>
          <Link to="/app/wallet#buy-credits" className="metric-action">Buy credits <Icon name="arrow-right" size={12} /></Link>
        </article>
        <article className="dashboard-stat-card dashboard-panel desktop-stat">
          <span className="metric-icon green-icon"><Icon name="bot" size={22} /></span>
          <div><span className="metric-label">Active Bots</span><strong>{runningBots.length}</strong><small>{bots.length} total · {runningBots.length} running</small></div>
        </article>
        <article className="dashboard-stat-card dashboard-panel desktop-stat">
          <span className="metric-icon blue-icon"><Icon name="broker" size={22} /></span>
          <div><span className="metric-label">Connected Accounts</span><strong>{connectedBrokers.length}</strong><small>{liveBrokers} live · {demoBrokers} demo</small></div>
        </article>
        <article className="dashboard-stat-card dashboard-panel desktop-stat">
          <span className="metric-icon purple-icon"><Icon name="notifications" size={22} /></span>
          <div><span className="metric-label">Notifications</span><strong>{notificationCount}</strong><small>Unread alerts</small></div>
          <Link to="/app/notifications" className="metric-action">View all <Icon name="arrow-right" size={12} /></Link>
        </article>
        <article className="dashboard-stat-card dashboard-panel mobile-stat">
          <span className="metric-icon blue-icon"><Icon name="bot" size={21} /></span>
          <div><span className="metric-label">Active Bots</span><strong>{runningBots.length}<small> / {bots.length}</small></strong></div>
          <i className="live-dot" />
        </article>
        <article className="dashboard-stat-card dashboard-panel mobile-stat">
          <span className="metric-icon green-icon"><Icon name="positions" size={21} /></span>
          <div><span className="metric-label">Open Positions</span><strong>{positions.length}</strong></div>
        </article>
        <article className="dashboard-stat-card dashboard-panel mobile-stat">
          <span className="metric-icon cyan-icon"><Icon name="wallet" size={21} /></span>
          <div><span className="metric-label">Account Equity</span><strong>{accountEquity}</strong><small>{equityCaption}</small></div>
        </article>
        <article className="dashboard-stat-card dashboard-panel mobile-stat">
          <span className="metric-icon gold-icon"><Icon name="performance" size={21} /></span>
          <div><span className="metric-label">Today’s Realized P/L</span><strong className={!pnlCurrencyUnavailable && todayPnl >= 0 ? 'positive-value' : pnlCurrencyUnavailable ? '' : 'negative-value'}>{performanceLoading || performanceError || pnlCurrencyUnavailable ? '—' : formatSigned(todayPnl)}</strong></div>
        </article>
      </section>

      <section className="dashboard-main-grid">
        <div className="dashboard-panel dashboard-section market-panel">
          <div className="dashboard-section-heading">
            <div><h2>Market Overview</h2><p>Instruments discovered from your broker</p></div>
            <Link to="/app/markets" className="text-link">View all <Icon name="arrow-right" size={13} /></Link>
          </div>
          <div className="market-tabs" role="group" aria-label="Instrument category">
            {([
              ['forex', 'Forex'], ['metal', 'Metals'], ['index', 'Indices'],
              ['crypto', 'Crypto'], ['more', 'More'],
            ] as Array<[MarketFilter, string]>).map(([value, label]) => (
              <button type="button" aria-pressed={marketFilter === value} className={marketFilter === value ? 'selected' : ''} key={value} onClick={() => setMarketFilter(value)}>{label}</button>
            ))}
          </div>
          {visibleSymbolsAllReadOnly && (
            <div className="market-trading-warning" role="status">
              <Icon name="help" size={14} />
              <p>Your broker reports these instruments as not tradable. Check that you connected with the MT5 trading password (not an investor password) and that trading is enabled for the account. <Link to="/app/brokers">Review account</Link></p>
            </div>
          )}
          {symbols.length === 0 ? (
            <div className="dashboard-empty">
              <span className="metric-icon gold-icon"><Icon name="markets" size={20} /></span>
              <p>No instruments discovered yet. Connect a broker and discover symbols to see them here.</p>
              <Link to="/app/brokers/new">Connect a broker <Icon name="arrow-right" size={13} /></Link>
            </div>
          ) : visibleSymbols.length === 0 ? (
            <div className="market-filter-empty">No instruments in this category.</div>
          ) : (
            <div className="market-list">
              {visibleSymbols.map((symbol, index) => (
                <Link to={`/app/markets?search=${encodeURIComponent(symbol.canonical_symbol)}`} className="market-row" key={symbol.id}>
                  <span className={`market-symbol-icon market-symbol-${index % 4}`}>{symbol.canonical_symbol.slice(0, 1)}</span>
                  <span className="market-symbol-copy">
                    <strong>{symbol.canonical_symbol}</strong>
                    <small>{symbol.description || symbol.broker_symbol}</small>
                  </span>
                  <span className="market-row-state"><small>{marketLabel(symbol.category)}</small>{symbol.is_tradable ? 'Available' : 'Not tradable'}</span>
                </Link>
              ))}
            </div>
          )}
          <p className="market-data-note">Instrument list only · live quotes are not shown on this overview.</p>
        </div>

        <div className="dashboard-panel dashboard-section portfolio-panel">
          <div className="dashboard-section-heading">
            <div><h2>Performance Overview</h2><p>Realized P/L over the selected period</p></div>
            <div className="chart-periods" aria-label="Performance period">
              {periods.map((period) => (
                <button type="button" key={period.days} className={days === period.days ? 'selected' : ''} aria-pressed={days === period.days} onClick={() => setDays(period.days)}>{period.label}</button>
              ))}
            </div>
          </div>
          <div className="performance-overview-total">
            <div><span>Net realized P/L</span><strong className={!pnlUnavailable && realizedPnl >= 0 ? 'positive-value' : pnlUnavailable ? '' : 'negative-value'}>{pnlValue}</strong></div>
            <span className="performance-currency">{multipleCurrencies ? 'Multiple currencies' : pnlCurrencyUnknown ? 'Currency unavailable' : pnlCurrencies[0] ?? 'Account currency'}</span>
          </div>
          {performanceLoading ? (
            <div className="chart-loading">Updating performance…</div>
          ) : performanceError ? (
            <div className="chart-empty" role="status">Performance data is temporarily unavailable.</div>
          ) : pnlCurrencyUnavailable ? (
            <div className="chart-empty" role="status">P/L is not shown when account currencies are mixed or unavailable.</div>
          ) : (
            <PerformanceChart data={dailyPnl} days={days} />
          )}
          {historySyncWarning && <p className="market-data-note" role="status">FXAPIs history could not be refreshed for one or more accounts. Showing saved results.</p>}
          <div className="performance-summary">
            <div><span>Closed trades</span><strong>{performanceLoading || performanceError ? '—' : totalTrades.toLocaleString()}</strong></div>
            <div><span>Win rate</span><strong>{performanceLoading || performanceError ? '—' : winRate}</strong></div>
            <div><span>Profit factor</span><strong>{performanceLoading || performanceError ? '—' : profitFactor}</strong></div>
          </div>
        </div>

        <div className="dashboard-panel dashboard-section actions-panel">
          <div className="dashboard-section-heading"><div><h2>Quick Actions</h2><p>Common tasks</p></div></div>
          <div className="dashboard-actions">
            <Link to="/app/bots/new" className="dashboard-action-primary"><Icon name="bot" size={17} /><span>Create AI Bot</span><Icon name="arrow-right" size={14} /></Link>
            <Link to="/app/brokers/new"><Icon name="broker" size={17} /><span>Connect Broker</span><Icon name="arrow-right" size={14} /></Link>
            <Link to="/app/wallet#buy-credits" className="dashboard-action-buy"><Icon name="credits" size={17} /><span>Buy Credits</span><Icon name="arrow-right" size={14} /></Link>
            <Link to="/app/performance" className="dashboard-action-report"><Icon name="analytics" size={17} /><span>View Reports</span><Icon name="arrow-right" size={14} /></Link>
          </div>
        </div>
      </section>

      <section className="dashboard-bottom-grid">
        <article className="dashboard-trust-card">
          <span className="dashboard-trust-icon"><Icon name="shield" size={20} /></span>
          <div><strong>Your account stays in your control</strong><p>Your trading capital remains at your broker. VANTA does not request withdrawal permission.</p></div>
        </article>
        <article className="dashboard-tip-card">
          <span className="dashboard-trust-icon"><Icon name="help" size={19} /></span>
          <div><strong>Pro tip</strong><p>{connectedBrokers.length === 0 ? 'Connect a demo account to discover instruments and set up your workspace.' : 'Review your bot settings and risk limits before starting a strategy.'}</p>
            <Link to={connectedBrokers.length === 0 ? '/app/brokers/new' : '/app/bots'}>{connectedBrokers.length === 0 ? 'Connect now' : 'Review bots'} <Icon name="arrow-right" size={13} /></Link>
          </div>
        </article>
      </section>

      {latestNotification && (
        <section className="dashboard-notice">
          <Icon name="notifications" size={17} />
          <span><strong>{latestNotification.title}</strong> {latestNotification.body}</span>
          <Link to="/app/notifications">See notifications <Icon name="arrow-right" size={13} /></Link>
        </section>
      )}
    </div>
  );
}

export { Dashboard };
