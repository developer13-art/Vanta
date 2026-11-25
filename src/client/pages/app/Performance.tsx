import React, { useEffect, useMemo, useState } from 'react';
import { api, ApiRequestError } from '../../api';
import { Icon } from '../../components/Icon';
import type { AnalyticsSummary, DailyPnl } from '../../../shared/types';

const periods = [
  { value: 1, label: 'Today' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
  { value: 'all' as const, label: 'All time' },
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

export function formatDailyPnlDate(day: string, options: Intl.DateTimeFormatOptions = {}): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.slice(0, 10));
  if (!match) return '—';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const dateOfMonth = Number(match[3]);
  const date = new Date(year, month - 1, dateOfMonth);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== dateOfMonth) return '—';
  return date.toLocaleDateString(undefined, options);
}

export function PerformanceChart({ data, days }: { data: DailyPnl[]; days: number | 'all' }): JSX.Element {
  const points = useMemo(() => {
    return data.map((item) => ({ day: item.day, pnl: Number(item.pnl) }));
  }, [data]);
  const width = 720;
  const height = 220;
  const left = 60;
  const right = 704;
  const top = 18;
  const bottom = 178;
  const min = Math.min(0, ...points.map((point) => point.pnl));
  const max = Math.max(0, ...points.map((point) => point.pnl));
  const range = max - min || 1;
  const zeroY = bottom - ((0 - min) / range) * (bottom - top);
  const slotWidth = points.length ? (right - left) / points.length : 0;
  const bars = points.map((point, index) => {
    const y = bottom - ((point.pnl - min) / range) * (bottom - top);
    const barHeight = Math.max(2, Math.abs(zeroY - y));
    return {
      x: left + slotWidth * (index + 0.5),
      y: Math.min(zeroY, y),
      width: Math.min(36, slotWidth * 0.58),
      height: barHeight,
      positive: point.pnl >= 0,
    };
  });
  const axisValues = [max, max - range / 2, min];
  const dateIndexes = [0, Math.floor((points.length - 1) / 2), points.length - 1]
    .filter((index, position, all) => index >= 0 && all.indexOf(index) === position);

  return (
    <div className="performance-chart-wrap">
      {points.length ? (
        <svg className="performance-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={days === 'all' ? 'Monthly realized profit and loss for all recorded history' : `Daily realized profit and loss for the last ${days} days`}>
          {axisValues.map((value, index) => {
            const y = top + ((bottom - top) * index) / 2;
            return <g key={index}><line className="performance-chart-grid" x1={left} x2={right} y1={y} y2={y} /><text className="performance-chart-axis" x="0" y={y + 4}>{formatNumber(value, 0)}</text></g>;
          })}
          <line className="performance-chart-zero" x1={left} x2={right} y1={zeroY} y2={zeroY} />
          {bars.map((bar, index) => (
            <rect
              className={bar.positive ? 'performance-chart-bar performance-chart-bar-positive' : 'performance-chart-bar performance-chart-bar-negative'}
              key={points[index]?.day ?? index}
              x={bar.x - bar.width / 2}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx="2"
            >
              <title>{`${points[index]?.day ?? ''}: ${formatSigned(points[index]?.pnl ?? 0)}`}</title>
            </rect>
          ))}
          {dateIndexes.map((index) => {
            const point = points[index];
            const bar = bars[index];
            if (!point || !bar) return null;
            return (
              <text className="performance-chart-date" key={index} x={bar.x} y="207" textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>
                {formatDailyPnlDate(point.day, days === 'all' ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' })}
              </text>
            );
          })}
        </svg>
      ) : (
        <div className="performance-chart-empty"><Icon name="analytics" size={24} /><strong>No closed trades in this period</strong><span>Realized results will appear here after positions close.</span></div>
      )}
      {points.length > 0 && <div className="performance-chart-legend"><i /><span>{days === 'all' ? 'Monthly' : 'Daily'} realized P/L</span><small>{days === 'all' ? `${data.length} recorded months · all time` : `${data.length} recorded day${data.length === 1 ? '' : 's'} · ${days} day range`}</small></div>}
    </div>
  );
}

export function Performance(): JSX.Element {
  const [days, setDays] = useState<number | 'all'>('all');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [daily, setDaily] = useState<DailyPnl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSyncWarning(false);
    const loadPerformance = async () => {
      try {
        const syncResult = await api.syncTradeHistory();
        if (active && syncResult.failedAccounts > 0) setSyncWarning(true);
      } catch {
        if (active) setSyncWarning(true);
      }
      return Promise.all([api.getAnalyticsSummary(days), api.getDailyPnl(days)]);
    };
    loadPerformance()
      .then(([nextSummary, nextDaily]) => {
        if (!active) return;
        setSummary(nextSummary);
        setDaily(nextDaily);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setSummary(null);
        setDaily([]);
        setError(cause instanceof ApiRequestError ? cause.message : 'Performance data could not be loaded.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, retryVersion]);

  const total = Number(summary?.pnl.total ?? 0);
  const wins = Number(summary?.pnl.wins ?? 0);
  const winRate = total > 0 ? (wins / total) * 100 : null;
  const realized = Number(summary?.pnl.realized ?? 0);

  return (
    <div className="performance-page">
      <header className="performance-heading">
        <div className="performance-title-wrap">
          <span className="performance-title-icon"><Icon name="performance" size={23} /></span>
          <div><span className="performance-eyebrow">TRADE HISTORY & INSIGHTS</span><h1>Performance</h1><p>Review closed-trade results from your connected strategies.</p></div>
        </div>
        <label className="performance-period">
          <Icon name="history" size={15} />
        <select aria-label="Performance date range" value={days} onChange={(event) => setDays(event.target.value === 'all' ? 'all' : Number(event.target.value))}>
          {periods.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
          </select>
        </label>
      </header>

      {error && <div className="performance-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setRetryVersion((value) => value + 1)}>Retry</button></div>}
      {syncWarning && !error && <div className="performance-alert" role="status"><span>FXAPIs history could not be refreshed for one or more accounts. Showing saved results.</span><button type="button" onClick={() => setRetryVersion((value) => value + 1)}>Retry</button></div>}
      {loading ? (
        <div className="performance-loading"><span className="dashboard-spinner" /> Loading performance data…</div>
      ) : summary && (
        <>
          <section className="performance-summary" aria-label="Performance summary">
            <article className="performance-stat performance-stat-green"><span className="performance-stat-icon"><Icon name="analytics" size={22} /></span><div><span>Realized P/L</span><strong className={realized >= 0 ? 'performance-positive' : 'performance-negative'}>{formatSigned(realized)}</strong><small>Selected period</small></div></article>
            <article className="performance-stat performance-stat-blue"><span className="performance-stat-icon"><Icon name="history" size={22} /></span><div><span>Closed trades</span><strong>{summary.pnl.total}</strong><small>{summary.pnl.wins} wins · {summary.pnl.losses} losses</small></div></article>
            <article className="performance-stat performance-stat-gold"><span className="performance-stat-icon"><Icon name="shield" size={22} /></span><div><span>Win rate</span><strong>{winRate === null ? '—' : `${winRate.toFixed(1)}%`}</strong><small>Wins divided by closed trades</small></div></article>
            <article className="performance-stat performance-stat-purple"><span className="performance-stat-icon"><Icon name="credits" size={22} /></span><div><span>Credits used</span><strong>{summary.creditsUsed.toLocaleString()}</strong><small>Selected period</small></div></article>
          </section>

          <section className="performance-main-grid">
            <article className="performance-panel performance-chart-panel">
              <div className="performance-panel-heading"><div><h2>Performance overview</h2><p>{days === 'all' ? 'Monthly realized P/L grouped by close date' : 'Daily realized P/L grouped by close date'}</p></div><span className="performance-period-tag">{periods.find((period) => period.value === days)?.label}</span></div>
              <PerformanceChart data={daily} days={days} />
            </article>
            <aside className="performance-panel performance-breakdown">
              <div className="performance-panel-heading"><div><h2>Trade breakdown</h2><p>From closed positions</p></div></div>
              <dl>
                <div><dt>Winning trades</dt><dd className="performance-positive">{summary.pnl.wins}</dd></div>
                <div><dt>Losing trades</dt><dd className="performance-negative">{summary.pnl.losses}</dd></div>
                <div><dt>Average win</dt><dd className="performance-positive">{formatSigned(Number(summary.pnl.avg_win))}</dd></div>
                <div><dt>Average loss</dt><dd className="performance-negative">{formatSigned(Number(summary.pnl.avg_loss))}</dd></div>
                <div><dt>Largest win</dt><dd className="performance-positive">{formatSigned(Number(summary.pnl.largest_win))}</dd></div>
                <div><dt>Largest loss</dt><dd className="performance-negative">{formatSigned(Number(summary.pnl.largest_loss))}</dd></div>
              </dl>
              <p className="performance-disclaimer">Past trade results do not guarantee future performance.</p>
            </aside>
          </section>

          <section className="performance-panel performance-daily-panel">
            <div className="performance-panel-heading"><div><h2>{days === 'all' ? 'Monthly results' : 'Daily results'}</h2><p>Realized P/L grouped by close date</p></div><span className="performance-result-count">{daily.length} {days === 'all' ? 'month' : 'day'}{daily.length === 1 ? '' : 's'} with trades</span></div>
            {daily.length === 0 ? (
              <div className="performance-daily-empty">No closed trades in this period.</div>
            ) : (
              <div className="performance-table-scroll">
                <table className="performance-table">
                  <thead><tr><th>Close date</th><th>Closed trades</th><th>{days === 'all' ? 'Monthly' : 'Daily'} realized P/L</th><th>Running total</th></tr></thead>
                  <tbody>
                    {daily.map((item, index) => {
                      const cumulative = daily.slice(0, index + 1).reduce((sum, day) => sum + Number(day.pnl), 0);
                      const pnl = Number(item.pnl);
                      return <tr key={item.day}><td>{formatDailyPnlDate(item.day, days === 'all' ? { month: 'long', year: 'numeric' } : undefined)}</td><td>{item.trades}</td><td className={pnl >= 0 ? 'performance-positive' : 'performance-negative'}>{formatSigned(pnl)}</td><td>{formatSigned(cumulative)}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="performance-data-note">Values are aggregated from all recorded closed positions in the selected range. Currency conversion is not applied.</p>
        </>
      )}
    </div>
  );
}
