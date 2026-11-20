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

export function PerformanceChart({ data, days }: { data: DailyPnl[]; days: number }): JSX.Element {
  const points = useMemo(() => {
    let total = 0;
    return data.map((item) => {
      total += Number(item.pnl);
      return { day: item.day, pnl: Number(item.pnl), cumulative: total };
    });
  }, [data]);
  const width = 720;
  const height = 220;
  const left = 60;
  const right = 704;
  const top = 18;
  const bottom = 178;
  const min = Math.min(0, ...points.map((point) => point.cumulative));
  const max = Math.max(0, ...points.map((point) => point.cumulative));
  const range = max - min || 1;
  const coordinates = points.map((point, index) => ({
    x: left + (points.length < 2 ? 0 : (index / (points.length - 1)) * (right - left)),
    y: bottom - ((point.cumulative - min) / range) * (bottom - top),
  }));
  const line = coordinates.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const firstPoint = coordinates[0];
  const lastPoint = coordinates[coordinates.length - 1];
  const area = firstPoint && lastPoint ? `${line} L ${lastPoint.x} ${bottom} L ${firstPoint.x} ${bottom} Z` : '';
  const axisValues = [max, max - range / 2, min];
  const dateIndexes = [0, Math.floor((points.length - 1) / 2), points.length - 1]
    .filter((index, position, all) => index >= 0 && all.indexOf(index) === position);

  return (
    <div className="performance-chart-wrap">
      {points.length ? (
        <svg className="performance-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Cumulative realized profit and loss for the last ${days} days`}>
          <defs>
            <linearGradient id="performanceAreaFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#00d996" stopOpacity=".28" />
              <stop offset="100%" stopColor="#00d996" stopOpacity="0" />
            </linearGradient>
          </defs>
          {axisValues.map((value, index) => {
            const y = top + ((bottom - top) * index) / 2;
            return <g key={index}><line className="performance-chart-grid" x1={left} x2={right} y1={y} y2={y} /><text className="performance-chart-axis" x="0" y={y + 4}>{formatNumber(value, 0)}</text></g>;
          })}
          {area && <path d={area} fill="url(#performanceAreaFill)" />}
          {line && <path d={line} className="performance-chart-line" />}
          {lastPoint && <circle className="performance-chart-point" cx={lastPoint.x} cy={lastPoint.y} r="4" />}
          {dateIndexes.map((index) => {
            const point = points[index];
            const coordinate = coordinates[index];
            if (!point || !coordinate) return null;
            return (
              <text className="performance-chart-date" key={index} x={coordinate.x} y="207" textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>
                {new Date(`${point.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </text>
            );
          })}
        </svg>
      ) : (
        <div className="performance-chart-empty"><Icon name="analytics" size={24} /><strong>No closed trades in this period</strong><span>Realized results will appear here after positions close.</span></div>
      )}
      {points.length > 0 && <div className="performance-chart-legend"><i /><span>Cumulative realized P/L</span><small>{data.length} recorded day{data.length === 1 ? '' : 's'} · {days} day range</small></div>}
    </div>
  );
}

export function Performance(): JSX.Element {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [daily, setDaily] = useState<DailyPnl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([api.getAnalyticsSummary(days), api.getDailyPnl(days)])
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
          <select aria-label="Performance date range" value={days} onChange={(event) => setDays(Number(event.target.value))}>
            {periods.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
          </select>
        </label>
      </header>

      {error && <div className="performance-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setRetryVersion((value) => value + 1)}>Retry</button></div>}
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
              <div className="performance-panel-heading"><div><h2>Performance overview</h2><p>Daily results accumulated across the selected period</p></div><span className="performance-period-tag">{periods.find((period) => period.value === days)?.label}</span></div>
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
            <div className="performance-panel-heading"><div><h2>Daily results</h2><p>Realized P/L grouped by close date</p></div><span className="performance-result-count">{daily.length} day{daily.length === 1 ? '' : 's'} with trades</span></div>
            {daily.length === 0 ? (
              <div className="performance-daily-empty">No closed trades in this period.</div>
            ) : (
              <div className="performance-table-scroll">
                <table className="performance-table">
                  <thead><tr><th>Close date</th><th>Closed trades</th><th>Daily realized P/L</th><th>Running total</th></tr></thead>
                  <tbody>
                    {daily.map((item, index) => {
                      const cumulative = daily.slice(0, index + 1).reduce((sum, day) => sum + Number(day.pnl), 0);
                      const pnl = Number(item.pnl);
                      return <tr key={item.day}><td>{new Date(`${item.day}T00:00:00`).toLocaleDateString()}</td><td>{item.trades}</td><td className={pnl >= 0 ? 'performance-positive' : 'performance-negative'}>{formatSigned(pnl)}</td><td>{formatSigned(cumulative)}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="performance-data-note">Values are aggregated from recorded closed positions. Currency conversion is not applied.</p>
        </>
      )}
    </div>
  );
}
