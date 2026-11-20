import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth-context';
import { Icon } from '../../components/Icon';
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

function formatName(email: string | null): string {
  const name = (email?.split('@')[0] ?? '').replace(/[._-]+/g, ' ').trim();
  return name
    ? name.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : 'Trader';
}

function PerformanceChart({ data, days }: { data: DailyPnl[]; days: number }): JSX.Element {
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
  const points = values.map((item, index) => ({
    x: left + (values.length < 2 ? 0 : (index / (values.length - 1)) * (right - left)),
    y: bottom - ((item.value - minValue) / span) * (bottom - top),
  }));
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const firstPoint = points.length ? points[0] : undefined;
  const lastPoint = points.length ? points[points.length - 1] : undefined;
  const areaPath = firstPoint && lastPoint
    ? `${linePath} L ${lastPoint.x} ${bottom} L ${firstPoint.x} ${bottom} Z`
    : '';
  const labels = [0, 1, 2, 3].map((index) => minValue + ((maxValue - minValue) * index) / 3);

  return (
    <div className="dashboard-chart">
      <svg
        className="dashboard-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Cumulative realized profit and loss for the last ${days} days`}
      >
        <defs>
          <linearGradient id="performanceFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#00d99a" stopOpacity=".34" />
            <stop offset="100%" stopColor="#00d99a" stopOpacity="0" />
          </linearGradient>
        </defs>
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
          const pointIndex = Math.min(values.length - 1, Math.round(((values.length - 1) * index) / 4));
          const date = values[pointIndex]?.day;
          return (
            <g key={index}>
              <line className="chart-gridline chart-gridline-vertical" x1={x} x2={x} y1={top} y2={bottom} />
              {date && <text className="chart-date-label" x={x} y="216" textAnchor="middle">{new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>}
            </g>
          );
        })}
        {firstPoint && lastPoint && (
          <>
            <path d={areaPath} fill="url(#performanceFill)" />
            <path d={linePath} className="chart-line" />
            <circle className="chart-last-point" cx={lastPoint.x} cy={lastPoint.y} r="4.5" />
          </>
        )}
        {points.length === 0 && (
          <text className="chart-empty-label" x={(left + right) / 2} y="104" textAnchor="middle">
            No closed trades in this period
          </text>
        )}
      </svg>
      <div className="chart-footnote">
        <span>{days} day{days === 1 ? '' : 's'}</span>
        <span>Cumulative realized P/L</span>
      </div>
    </div>
  );
}

function Dashboard(): JSX.Element {
  const { email } = useAuth();
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [symbols, setSymbols] = useState<BrokerSymbol[]>([]);
  const [dailyPnl, setDailyPnl] = useState<DailyPnl[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [performanceLoading, setPerformanceLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [performanceError, setPerformanceError] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api.listBrokers(),
      api.listBots(),
      api.listOpenPositions(),
      api.getWallet(),
      api.listNotifications({ limit: 5 }),
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
      if (symbolResult.status === 'fulfilled') setSymbols(symbolResult.value);
      else failed = true;
      setLoadError(failed);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setPerformanceLoading(true);
    setPerformanceError(false);
    Promise.allSettled([api.getAnalyticsSummary(days), api.getDailyPnl(days)]).then(([summaryResult, dailyResult]) => {
      if (!active) return;
      if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value);
      if (dailyResult.status === 'fulfilled') setDailyPnl(dailyResult.value);
      setPerformanceError(summaryResult.status === 'rejected' || dailyResult.status === 'rejected');
      setPerformanceLoading(false);
    });
    return () => { active = false; };
  }, [days]);

  const name = formatName(email);
  const runningBots = bots.filter((bot) => bot.state === 'running');
  const today = dailyPnl.find((item) => new Date(item.day).toDateString() === new Date().toDateString());
  const latestNotification = notifications[0];
  const todayPnl = Number(today?.pnl ?? 0);
  const realizedPnl = Number(summary?.pnl.realized ?? 0);
  const currencies = [...new Set(brokers.map((broker) => broker.account_currency).filter((value): value is string => !!value))];
  const equityValues = brokers
    .flatMap((broker) => {
      const value = broker.account_equity ?? broker.account_balance;
      return value === null ? [] : [Number(value)];
    })
    .filter((value) => Number.isFinite(value));
  const hasCompleteEquity = brokers.length > 0 && equityValues.length === brokers.length;
  const accountEquity = currencies.length > 1
    ? 'Multiple'
    : hasCompleteEquity
    ? formatNumber(equityValues.reduce((total, value) => total + value, 0))
    : '—';
  const equityCaption = currencies.length > 1
    ? 'Multi-currency'
    : currencies.length === 1
      ? currencies[0]
      : brokers.length > 0 ? 'Balance unavailable' : 'Connect an account';

  if (loading) {
    return <div className="dashboard-loading"><span className="dashboard-spinner" /> Loading your dashboard…</div>;
  }

  return (
    <div className="dashboard-page">
      {loadError && (
        <div className="dashboard-alert" role="status">
          Some dashboard information could not be loaded. Check your connection and refresh to try again.
        </div>
      )}

      <section className="dashboard-hero">
        <div className="dashboard-welcome dashboard-panel">
          <div className="welcome-graphic" aria-hidden="true">
            <svg viewBox="0 0 110 86">
              <path d="M7 68 28 50l15 9 20-30 15 10 23-26" />
              <path d="M84 13h17v17" />
              <path className="welcome-glow" d="M4 78 28 61l16 8 20-30 15 10 25-25" />
            </svg>
          </div>
          <div className="welcome-copy">
            <span className="dashboard-eyebrow">YOUR TRADING OVERVIEW</span>
            <h1>Welcome back, {name}!</h1>
            <p>Your AI trading journey is on track.</p>
          </div>
        </div>

        <div className="dashboard-hero-card credits-card dashboard-panel">
          <span className="hero-card-icon gold-icon"><Icon name="credits" size={27} /></span>
          <div className="hero-card-copy">
            <span>Available Credits</span>
            <strong>{wallet?.available_credits.toLocaleString() ?? '—'}</strong>
          </div>
          <Link to="/app/wallet#buy-credits" className="gold-button">Buy Credits <Icon name="arrow-right" size={14} /></Link>
        </div>

        <div className="dashboard-hero-card performance-card dashboard-panel">
          <div>
            <span className="hero-card-label">Realized P/L · {days}D</span>
            <strong className={realizedPnl >= 0 ? 'positive-value' : 'negative-value'}>
              {performanceLoading || performanceError || !summary ? '—' : formatSigned(realizedPnl)}
            </strong>
          </div>
          <div className="performance-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        </div>
      </section>

      <section className="dashboard-metrics" aria-label="Account summary">
        <div className="metric-card dashboard-panel">
          <span className="metric-icon blue-icon"><Icon name="bot" size={24} /></span>
          <div><span className="metric-label">Active Bots</span><strong>{runningBots.length}<small> / {bots.length}</small></strong></div>
          <span className="live-dot" aria-label="Live" />
        </div>
        <div className="metric-card dashboard-panel">
          <span className="metric-icon green-icon"><Icon name="positions" size={24} /></span>
          <div><span className="metric-label">Open Positions</span><strong>{positions.length}</strong></div>
        </div>
        <div className="metric-card dashboard-panel">
          <span className="metric-icon cyan-icon"><Icon name="wallet" size={24} /></span>
          <div><span className="metric-label">Account Equity</span><strong>{accountEquity}</strong><small>{equityCaption}</small></div>
        </div>
        <div className="metric-card dashboard-panel">
          <span className="metric-icon gold-icon"><Icon name="performance" size={24} /></span>
          <div><span className="metric-label">Today’s Realized P/L</span><strong className={todayPnl >= 0 ? 'positive-value' : 'negative-value'}>{formatSigned(todayPnl)}</strong></div>
        </div>
      </section>

      <section className="dashboard-main-grid">
        <div className="dashboard-panel dashboard-section portfolio-panel">
          <div className="dashboard-section-heading">
            <div><h2>Portfolio Performance</h2><p>Realized profit and loss over time</p></div>
            <div className="chart-periods" aria-label="Performance period">
              {periods.map((period) => (
                <button
                  type="button"
                  key={period.days}
                  className={days === period.days ? 'selected' : ''}
                  aria-pressed={days === period.days}
                  onClick={() => setDays(period.days)}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>
          {performanceLoading ? (
            <div className="chart-loading">Updating performance…</div>
          ) : performanceError ? (
            <div className="chart-empty" role="status">Performance data is temporarily unavailable.</div>
          ) : (
            <PerformanceChart data={dailyPnl} days={days} />
          )}
        </div>

        <div className="dashboard-panel dashboard-section market-panel">
          <div className="dashboard-section-heading">
            <div><h2>Market Overview</h2><p>Your connected instruments</p></div>
            <Link to="/app/markets" className="text-link">View all <Icon name="arrow-right" size={14} /></Link>
          </div>
          {symbols.length === 0 ? (
            <div className="dashboard-empty">
              <span className="metric-icon gold-icon"><Icon name="markets" size={20} /></span>
              <p>No markets yet. Connect a broker and discover symbols to see your instruments here.</p>
              <Link to="/app/brokers/new">Connect a broker <Icon name="arrow-right" size={13} /></Link>
            </div>
          ) : (
            <div className="market-list">
              {symbols.slice(0, 4).map((symbol, index) => (
                <Link to="/app/markets" className="market-row" key={symbol.id}>
                  <span className={`market-symbol-icon market-symbol-${index % 4}`}>{symbol.canonical_symbol.slice(0, 1)}</span>
                  <span className="market-symbol-copy">
                    <strong>{symbol.canonical_symbol}</strong>
                    <small>{symbol.description || symbol.category.replace(/_/g, ' ')}</small>
                  </span>
                  <span className="market-category">{symbol.category.replace(/_/g, ' ')}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="dashboard-bottom-grid">
        <div className="dashboard-panel dashboard-section bots-panel">
          <div className="dashboard-section-heading">
            <div><h2>Your Bots</h2><p>{runningBots.length} running · {bots.length} total</p></div>
            <Link to="/app/bots" className="text-link">View all <Icon name="arrow-right" size={14} /></Link>
          </div>
          {bots.length === 0 ? (
            <div className="dashboard-empty compact-empty">
              <p>You haven’t created a bot yet.</p>
              <Link to="/app/bots/new">Create your first bot <Icon name="arrow-right" size={13} /></Link>
            </div>
          ) : (
            <div className="bot-list">
              {bots.slice(0, 3).map((bot) => (
                <Link to={`/app/bots/${bot.id}`} className="bot-row" key={bot.id}>
                  <span className={`bot-avatar${bot.state === 'running' ? ' bot-avatar-active' : ''}`}><Icon name="bot" size={22} /></span>
                  <span className="bot-info">
                    <strong>{bot.name}</strong>
                    <small>{bot.strategy_name} <i /> {bot.open_positions} open</small>
                  </span>
                  <span className={`bot-state${bot.state === 'running' ? ' bot-state-active' : ''}`}>
                    {bot.state.replace(/_/g, ' ')}
                  </span>
                  <Icon name="arrow-right" size={16} className="bot-row-arrow" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-panel dashboard-section actions-panel">
          <div className="dashboard-section-heading"><div><h2>Quick Actions</h2><p>Jump back into your workflow</p></div></div>
          <div className="dashboard-actions">
            <Link to="/app/bots/new"><Icon name="plus" size={17} /><span>Create New Bot</span><Icon name="arrow-right" size={14} /></Link>
            <Link to="/app/wallet#buy-credits"><Icon name="credits" size={17} /><span>Buy Credits</span><Icon name="arrow-right" size={14} /></Link>
            <Link to="/app/performance"><Icon name="analytics" size={17} /><span>View Analytics</span><Icon name="arrow-right" size={14} /></Link>
            <Link to="/app/brokers"><Icon name="settings" size={17} /><span>Manage Accounts</span><Icon name="arrow-right" size={14} /></Link>
          </div>
        </div>

        <div className="dashboard-upgrade">
          <svg className="upgrade-art" viewBox="0 0 320 150" aria-hidden="true">
            <g className="candle-sticks">
              <path d="M18 106V67m17 48V51m17 58V72m17 35V41m17 44V31m17 53V47m17 26V24m17 48V35m17 38V19m17 47V27" />
              <path className="down-candles" d="M48 72v20m34-37v22m51-32v21m51-23v24" />
            </g>
            <path className="upgrade-bull" d="M219 105c-15-1-24-9-27-23l-15-8 7-7 17 2 7-13-7-13 9-11 13 8 14-1 13-9 13 8 16-2 9 9-10 12-1 17-11 8-4 14-16 8-2 12-15 2-6-10zm-18-28-13-1 8 8m62-35 15-10-4 17m-40 68v-13" />
            <path className="upgrade-spark" d="M181 37 215 14m-27 40 22-24m16 93 42-31" />
          </svg>
          <div className="upgrade-copy">
            <span className="dashboard-eyebrow">LEVEL UP YOUR STRATEGY</span>
            <h2>Unlock more potential</h2>
            <p>Explore your tools and build your next trading strategy.</p>
            <Link to="/app/bots/new" className="gold-button">Create a trading bot <Icon name="arrow-right" size={14} /></Link>
          </div>
        </div>
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
