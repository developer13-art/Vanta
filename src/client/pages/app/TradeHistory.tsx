import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Icon } from '../../components/Icon';
import { PerformanceChart } from './Performance';
import type { AnalyticsSummary, DailyPnl, TradeHistoryEntry } from '../../../shared/types';

const periods = [
  { value: 1, label: 'Today' },
  { value: 7, label: '7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
];

type ResultFilter = 'all' | 'profitable' | 'losses';

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatSigned(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value))}`;
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function TradeHistory(): JSX.Element {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<TradeHistoryEntry[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [daily, setDaily] = useState<DailyPnl[]>([]);
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [botFilter, setBotFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<'load' | 'export'>('load');
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setErrorAction('load');
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    Promise.all([
      api.listHistory({ from }),
      api.getAnalyticsSummary(days),
      api.getDailyPnl(days),
    ]).then(([historyRows, analytics, dailyResults]) => {
      if (!active) return;
      setRows(historyRows);
      setSummary(analytics);
      setDaily(dailyResults);
      setBotFilter('');
    }).catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof ApiRequestError ? cause.message : 'Trade history could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, retryVersion]);

  const bots = useMemo(() => [...new Set(rows.map((row) => row.bot_name))].sort(), [rows]);
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const pnl = Number(row.realized_pl ?? 0);
      const matchesResult = resultFilter === 'all' || (resultFilter === 'profitable' ? pnl > 0 : pnl < 0);
      const matchesBot = !botFilter || row.bot_name === botFilter;
      const matchesSearch = !query || `${row.canonical_symbol} ${row.broker_ticket} ${row.bot_name} ${row.broker_account_label}`
        .toLowerCase()
        .includes(query);
      return matchesResult && matchesBot && matchesSearch;
    });
  }, [botFilter, resultFilter, rows, search]);

  const total = Number(summary?.pnl.total ?? 0);
  const wins = Number(summary?.pnl.wins ?? 0);
  const winRate = total > 0 ? (wins / total) * 100 : null;
  const realized = Number(summary?.pnl.realized ?? 0);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await api.exportHistoryCsv();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'trade-history.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (errorAction === 'export') setError(null);
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Trade history export failed.');
      setErrorAction('export');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="trade-history-page">
      <header className="trade-history-heading">
        <div className="trade-history-title-wrap">
          <span className="trade-history-title-icon"><Icon name="history" size={23} /></span>
          <div><span className="trade-history-eyebrow">CLOSED POSITIONS & ANALYTICS</span><h1>Trade History & Performance</h1><p>Review closed trades and realized results over time.</p></div>
        </div>
        <div className="trade-history-heading-actions">
          <label className="trade-history-period"><Icon name="history" size={15} /><select aria-label="Trade history date range" value={days} onChange={(event) => setDays(Number(event.target.value))}>{periods.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}</select></label>
          <button type="button" className="trade-history-export" onClick={exportCsv} disabled={exporting}><Icon name="analytics" size={15} />{exporting ? 'Preparing…' : 'Export CSV'}</button>
        </div>
      </header>

      {error && <div className="trade-history-alert" role="alert"><span>{error}</span><button type="button" onClick={() => errorAction === 'export' ? exportCsv() : setRetryVersion((value) => value + 1)}>{errorAction === 'export' ? 'Retry export' : 'Retry'}</button></div>}
      {loading ? (
        <div className="trade-history-loading"><span className="dashboard-spinner" /> Loading trade history…</div>
      ) : summary && (
        <>
          <section className="trade-history-summary" aria-label="Trade performance summary">
            <article className="trade-history-stat trade-history-stat-blue"><span><Icon name="history" size={22} /></span><div><small>Closed trades</small><strong>{summary.pnl.total}</strong><em>{summary.pnl.wins} wins · {summary.pnl.losses} losses</em></div></article>
            <article className="trade-history-stat trade-history-stat-gold"><span><Icon name="shield" size={22} /></span><div><small>Win rate</small><strong>{winRate === null ? '—' : `${winRate.toFixed(1)}%`}</strong><em>Wins / closed trades</em></div></article>
            <article className="trade-history-stat trade-history-stat-green"><span><Icon name="performance" size={22} /></span><div><small>Realized P/L</small><strong className={realized >= 0 ? 'trade-history-positive' : 'trade-history-negative'}>{formatSigned(realized)}</strong><em>Selected period</em></div></article>
            <article className="trade-history-stat trade-history-stat-purple"><span><Icon name="credits" size={22} /></span><div><small>Credits used</small><strong>{summary.creditsUsed.toLocaleString()}</strong><em>Selected period</em></div></article>
          </section>

          <section className="trade-history-main-grid">
            <article className="trade-history-panel trade-history-chart-panel">
              <div className="trade-history-panel-heading"><div><h2>Performance overview</h2><p>Cumulative realized P/L from closed trades</p></div><span>{periods.find((period) => period.value === days)?.label}</span></div>
              <PerformanceChart data={daily} days={days} />
            </article>
            <aside className="trade-history-panel trade-history-breakdown">
              <div className="trade-history-panel-heading"><div><h2>Performance summary</h2><p>Results recorded for this period</p></div></div>
              <dl>
                <div><dt>Average win</dt><dd className="trade-history-positive">{formatSigned(Number(summary.pnl.avg_win))}</dd></div>
                <div><dt>Average loss</dt><dd className="trade-history-negative">{formatSigned(Number(summary.pnl.avg_loss))}</dd></div>
                <div><dt>Largest win</dt><dd className="trade-history-positive">{formatSigned(Number(summary.pnl.largest_win))}</dd></div>
                <div><dt>Largest loss</dt><dd className="trade-history-negative">{formatSigned(Number(summary.pnl.largest_loss))}</dd></div>
              </dl>
              <p>Historical results are not a guarantee of future performance.</p>
            </aside>
          </section>

          <section className="trade-history-panel trade-history-table-panel">
            <div className="trade-history-panel-heading"><div><h2>Closed trades</h2><p>Latest up to 1,000 records in the selected range</p></div><span>{visibleRows.length} shown</span></div>
            <div className="trade-history-toolbar">
              <div className="trade-history-filter-tabs" role="group" aria-label="Filter trade results">
                {([
                  { value: 'all', label: 'All trades' },
                  { value: 'profitable', label: 'Profitable' },
                  { value: 'losses', label: 'Losses' },
                ] as Array<{ value: ResultFilter; label: string }>).map((filter) => (
                  <button type="button" className={resultFilter === filter.value ? 'active' : ''} aria-pressed={resultFilter === filter.value} key={filter.value} onClick={() => setResultFilter(filter.value)}>{filter.label}</button>
                ))}
              </div>
              <div className="trade-history-filter-controls">
                <label className="trade-history-search"><Icon name="search" size={14} /><input aria-label="Search trade history" placeholder="Search symbol, bot, account..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                <select aria-label="Filter by bot" className="trade-history-bot-filter" value={botFilter} onChange={(event) => setBotFilter(event.target.value)}>
                  <option value="">All bots</option>{bots.map((bot) => <option value={bot} key={bot}>{bot}</option>)}
                </select>
              </div>
            </div>
            {visibleRows.length === 0 ? (
              <div className="trade-history-empty"><span className="trade-history-empty-icon"><Icon name="history" size={22} /></span><strong>{rows.length ? 'No trades match these filters' : 'No closed trades in this period'}</strong><p>{rows.length ? 'Adjust your search or filters to see more results.' : 'Closed trade results will appear here when available.'}</p></div>
            ) : (
              <div className="trade-history-table-scroll">
                <table className="trade-history-table">
                  <thead><tr><th>Closed</th><th>Symbol</th><th>Side</th><th>Volume</th><th>Entry</th><th>Close</th><th>Realized P/L</th><th>Bot</th><th>Result</th><th /></tr></thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const pnl = Number(row.realized_pl ?? 0);
                      const result = row.realized_pl === null ? 'Unavailable' : pnl > 0 ? 'Profit' : pnl < 0 ? 'Loss' : 'Break-even';
                      const credits = row.credit_events.reduce((sum, event) => sum + event.delta, 0);
                      return (
                        <tr key={row.id}>
                          <td>{formatTimestamp(row.closed_at)}</td>
                          <td><strong className="trade-history-symbol">{row.canonical_symbol}</strong><small>{row.broker_account_label}</small></td>
                          <td><span className={`trade-history-side trade-history-side-${row.side.toLowerCase()}`}>{row.side}</span></td>
                          <td>{row.volume}</td><td>{row.entry_price}</td><td>{row.close_price ?? '—'}</td>
                          <td className={row.realized_pl === null ? '' : pnl >= 0 ? 'trade-history-positive' : 'trade-history-negative'}>{row.realized_pl === null ? '—' : formatSigned(pnl)}</td>
                          <td>{row.bot_name}</td><td><span className={`trade-history-result trade-history-result-${result.toLowerCase()}`}>{result}</span></td>
                          <td><Link to={`/app/history/${row.id}`} className="trade-history-view" aria-label={`View ${row.canonical_symbol} trade details`}><Icon name="arrow-right" size={14} /></Link><span className="trade-history-credit-note" title={`Credit ledger change: ${credits}`}>{credits ? `${credits} cr` : ''}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="trade-history-data-note">P/L values are reported by your broker and aggregated as stored. Currency conversion is not applied.</p>
        </>
      )}
    </div>
  );
}
