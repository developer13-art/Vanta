import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Icon } from '../../components/Icon';
import { useToast } from '../../toast-context';
import type { BotSummary, BrokerAccount, BrokerSymbol, DailyPnl, Position } from '../../../shared/types';

type PositionCategory = 'all' | 'forex' | 'metal' | 'index' | 'crypto' | 'other';

const categories: Array<{ key: PositionCategory; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'forex', label: 'Forex' },
  { key: 'metal', label: 'Metals' },
  { key: 'index', label: 'Indices' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'other', label: 'Other' },
];

function getCategory(category?: string): PositionCategory {
  if (!category) return 'other';
  if (category.startsWith('forex_')) return 'forex';
  if (category === 'metal') return 'metal';
  if (category === 'index') return 'index';
  if (category === 'crypto_cfd') return 'crypto';
  return 'other';
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
}

function PortfolioSparkline({ data }: { data: DailyPnl[] }): JSX.Element {
  let total = 0;
  const points = data.map((item, index) => {
    total += Number(item.pnl);
    return {
      x: data.length < 2 ? 10 : 10 + (index / (data.length - 1)) * 280,
      y: total,
    };
  });
  const low = Math.min(0, ...points.map((point) => point.y));
  const high = Math.max(0, ...points.map((point) => point.y));
  const span = high - low || 1;
  const path = points.map((point, index) =>
    `${index === 0 ? 'M' : 'L'} ${point.x} ${88 - ((point.y - low) / span) * 70}`,
  ).join(' ');
  const lastPoint = points.length ? points[points.length - 1] : undefined;

  return (
    <div className="positions-sparkline">
      {points.length === 0 ? (
        <div className="positions-chart-empty">No closed trades in this period</div>
      ) : (
        <svg viewBox="0 0 300 104" role="img" aria-label="Cumulative realized profit and loss over the last 30 days">
          <defs>
            <linearGradient id="positionsChartFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#00d99a" stopOpacity=".3" />
              <stop offset="100%" stopColor="#00d99a" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2].map((line) => <line key={line} className="positions-chart-grid" x1="10" x2="290" y1={18 + line * 35} y2={18 + line * 35} />)}
          <path d={`${path} L 290 94 L 10 94 Z`} fill="url(#positionsChartFill)" />
          <path d={path} className="positions-chart-line" />
          {lastPoint && <circle className="positions-chart-point" cx={lastPoint.x} cy={18 + ((high - lastPoint.y) / span) * 70} r="3.5" />}
        </svg>
      )}
    </div>
  );
}

export function Positions(): JSX.Element {
  const [positions, setPositions] = useState<Position[]>([]);
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);
  const [symbols, setSymbols] = useState<BrokerSymbol[]>([]);
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [dailyPnl, setDailyPnl] = useState<DailyPnl[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [category, setCategory] = useState<PositionCategory>('all');
  const [accountId, setAccountId] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const pageSize = 6;

  const load = async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    const results = await Promise.allSettled([
      api.listOpenPositions(),
      api.listBrokers(),
      api.listSymbols(),
      api.listBots(),
      api.getDailyPnl(30),
    ]);
    const [positionsResult, brokersResult, symbolsResult, botsResult, pnlResult] = results;
    const failed = results.some((result) => result.status === 'rejected');
    if (positionsResult.status === 'fulfilled') {
      setPositions(positionsResult.value);
      setSelected((current) => current.filter((id) => positionsResult.value.some((position) => position.id === id)));
    }
    if (brokersResult.status === 'fulfilled') setBrokers(brokersResult.value);
    if (symbolsResult.status === 'fulfilled') setSymbols(symbolsResult.value);
    if (botsResult.status === 'fulfilled') setBots(botsResult.value);
    if (pnlResult.status === 'fulfilled') setDailyPnl(pnlResult.value);
    if (failed) setError('Some position information could not be loaded. Refresh to try again.');
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { void load(true); }, []);

  const symbolCategories = useMemo(() => {
    const map = new Map<string, PositionCategory>();
    symbols.forEach((symbol) => {
      map.set(symbol.canonical_symbol.toUpperCase(), getCategory(symbol.category));
      map.set(symbol.broker_symbol.toUpperCase(), getCategory(symbol.category));
    });
    return map;
  }, [symbols]);

  const accounts = brokers;
  const accountPositions = useMemo(() => (
    accountId === 'all'
      ? positions
      : positions.filter((position) => position.broker_account_id === accountId)
  ), [accountId, positions]);

  const filteredPositions = useMemo(() => accountPositions.filter((position) => {
    const positionCategory = symbolCategories.get(position.canonical_symbol.toUpperCase())
      ?? symbolCategories.get(position.broker_symbol.toUpperCase())
      ?? 'other';
    return category === 'all' || positionCategory === category;
  }), [accountPositions, category, symbolCategories]);

  const pageCount = Math.max(1, Math.ceil(filteredPositions.length / pageSize));
  const pagePositions = filteredPositions.slice((page - 1) * pageSize, page * pageSize);
  const allVisibleSelected = pagePositions.length > 0 && pagePositions.every((position) => selected.includes(position.id));
  const floatingPl = accountPositions.reduce((sum, position) => sum + Number(position.floating_pl ?? 0), 0);
  const positionAccountIds = new Set(accountPositions.map((position) => position.broker_account_id));
  const positionBrokers = brokers.filter((broker) => positionAccountIds.has(broker.id));
  const positionCurrencies = new Set(positionBrokers.map((broker) => broker.account_currency).filter((value): value is string => !!value));
  const hasUnknownPositionCurrency = accountPositions.some((position) =>
    !brokers.find((broker) => broker.id === position.broker_account_id)?.account_currency,
  );
  const hasMixedPnlCurrencies = positionCurrencies.size > 1 || hasUnknownPositionCurrency;
  const hasCompleteFloatingPl = accountPositions.every((position) => position.floating_pl !== null);
  const pnlLabel = accountPositions.length === 0
    ? '0.00'
    : !hasCompleteFloatingPl ? '—'
      : hasMixedPnlCurrencies ? 'Multiple'
        : `${floatingPl < 0 ? '−' : floatingPl > 0 ? '+' : ''}${formatAmount(floatingPl)}`;
  const pnlCurrency = positionCurrencies.size === 1 && !hasUnknownPositionCurrency
    ? [...positionCurrencies][0]
    : hasMixedPnlCurrencies ? 'Multiple currencies' : 'Currency unavailable';
  const relevantBrokers = brokers.filter((broker) => accountId === 'all' || broker.id === accountId);
  const relevantAccountsHaveBalance = relevantBrokers.length > 0 && relevantBrokers.every((broker) => broker.account_balance !== null);
  const relevantAccountsHaveEquity = relevantBrokers.length > 0 && relevantBrokers.every((broker) => broker.account_equity !== null);
  const balanceCurrencies = new Set(relevantBrokers.map((broker) => broker.account_currency).filter((value): value is string => !!value));
  const allAccountCurrenciesKnown = relevantBrokers.every((broker) => !!broker.account_currency);
  const balanceValue = relevantAccountsHaveBalance && balanceCurrencies.size === 1 && allAccountCurrenciesKnown
    ? formatAmount(relevantBrokers.reduce((sum, broker) => sum + Number(broker.account_balance), 0))
    : balanceCurrencies.size > 1 || (balanceCurrencies.size === 1 && !allAccountCurrenciesKnown) ? 'Multiple' : '—';
  const equityValue = relevantAccountsHaveEquity && balanceCurrencies.size === 1 && allAccountCurrenciesKnown
    ? formatAmount(relevantBrokers.reduce((sum, broker) => sum + Number(broker.account_equity), 0))
    : balanceCurrencies.size > 1 || (balanceCurrencies.size === 1 && !allAccountCurrenciesKnown) ? 'Multiple' : '—';
  const selectedAccountLabel = brokers.find((broker) => broker.id === accountId)?.label;
  const relevantRunningBots = bots.filter((bot) =>
    bot.state === 'running' && (accountId === 'all' || bot.broker_account_label === selectedAccountLabel),
  );
  const enabledRiskControls = relevantRunningBots.filter((bot) =>
    Number(bot.daily_loss_limit) > 0 && Number(bot.drawdown_limit) > 0 && Number(bot.margin_utilization_limit) > 0,
  ).length;

  useEffect(() => { setPage(1); }, [category, accountId]);

  const closePositions = async (ids: string[]) => {
    setBusy(true);
    try {
      let failed = 0;
      for (let offset = 0; offset < ids.length; offset += 100) {
        const result = await api.closePositions(ids.slice(offset, offset + 100));
        failed += result.results.filter((item) => !item.ok).length;
      }
      toast.success(failed ? `Close requested. ${failed} position(s) could not be closed.` : `Close requested for ${ids.length} position(s).`);
      setSelected([]);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Close failed');
    } finally {
      setBusy(false);
    }
  };

  const closeSelected = async () => {
    if (!selected.length || !confirm(`Close ${selected.length} selected position(s)? Review each trade before confirming.`)) return;
    await closePositions(selected);
  };

  const closeOne = async (position: Position) => {
    if (!confirm(`Close ${position.canonical_symbol} ${position.side.toUpperCase()} position?`)) return;
    await closePositions([position.id]);
  };

  const toggleVisibleSelection = (checked: boolean) => {
    const visibleIds = pagePositions.map((position) => position.id);
    setSelected((current) => checked
      ? [...new Set([...current, ...visibleIds])]
      : current.filter((id) => !visibleIds.includes(id)));
  };

  return (
    <div className="positions-page">
      {error && <div className="positions-alert" role="status">{error}</div>}
      <header className="positions-heading">
        <div className="positions-title-wrap">
          <span className="positions-title-icon"><Icon name="positions" size={27} /></span>
          <div><h1>Open Positions</h1><p>Monitor and manage active trades across your bots and accounts.</p></div>
        </div>
        <div className="positions-heading-actions">
          <select className="positions-select" aria-label="Filter by broker account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="all">All Accounts</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
          </select>
          <button type="button" className="positions-refresh" onClick={() => void load()} disabled={refreshing} aria-label="Refresh positions">
            <Icon name="refresh" size={17} className={refreshing ? 'positions-spinning' : undefined} />
          </button>
        </div>
      </header>

      <section className="positions-summary">
        <article className="positions-stat positions-stat-blue">
          <span className="positions-stat-icon"><Icon name="positions" size={24} /></span>
          <div><span>Total Open Positions</span><strong>{loading ? '—' : accountPositions.length}</strong></div>
        </article>
        <article className="positions-stat positions-stat-green">
          <span className="positions-stat-icon"><Icon name="performance" size={24} /></span>
          <div><span>Unrealized P/L</span><strong>{loading ? '—' : pnlLabel}</strong><small>{pnlCurrency}</small></div>
        </article>
        <article className="positions-stat positions-stat-purple">
          <span className="positions-stat-icon"><Icon name="wallet" size={24} /></span>
          <div><span>Account Balance</span><strong>{loading ? '—' : balanceValue}</strong><small>{balanceCurrencies.size === 1 ? [...balanceCurrencies][0] : balanceCurrencies.size > 1 ? 'Multiple currencies' : 'No account data'}</small></div>
        </article>
        <article className="positions-stat positions-stat-gold">
          <span className="positions-stat-icon"><Icon name="credits" size={24} /></span>
          <div><span>Total Equity</span><strong>{loading ? '—' : equityValue}</strong><small>{balanceCurrencies.size === 1 ? [...balanceCurrencies][0] : balanceCurrencies.size > 1 ? 'Multiple currencies' : 'No account data'}</small></div>
        </article>
      </section>

      <section className="positions-content-grid">
        <div className="positions-table-panel">
          <div className="positions-filter-bar">
            <div className="positions-category-tabs" role="group" aria-label="Filter positions by market">
              {categories.map((item) => {
                const count = item.key === 'all' ? accountPositions.length : accountPositions.filter((position) => (
                  (symbolCategories.get(position.canonical_symbol.toUpperCase())
                    ?? symbolCategories.get(position.broker_symbol.toUpperCase())
                    ?? 'other') === item.key
                )).length;
                return (
                  <button
                    type="button"
                    key={item.key}
                    className={category === item.key ? 'active' : ''}
                    aria-pressed={category === item.key}
                    onClick={() => setCategory(item.key)}
                  >{item.label} ({count})</button>
                );
              })}
            </div>
            {selected.length > 0 && (
              <button type="button" className="positions-close-selected" disabled={busy} onClick={() => void closeSelected()}>
                Close selected ({selected.length})
              </button>
            )}
          </div>

          {loading ? (
            <div className="positions-empty-state">Loading open positions…</div>
          ) : accountPositions.length === 0 ? (
            <div className="positions-empty-state">
              <span className="positions-empty-icon"><Icon name="positions" size={25} /></span>
              <strong>No open positions</strong>
              <p>Positions opened by your bots will appear here.</p>
              <Link to="/app/bots">View your bots <Icon name="arrow-right" size={14} /></Link>
            </div>
          ) : filteredPositions.length === 0 ? (
            <div className="positions-empty-state">No positions match these filters.</div>
          ) : (
            <>
              <div className="positions-table-scroll">
                <table className="positions-table">
                  <thead>
                    <tr>
                      <th><input type="checkbox" aria-label="Select all positions on this page" checked={allVisibleSelected} onChange={(event) => toggleVisibleSelection(event.target.checked)} /></th>
                      <th>Symbol</th><th>Direction</th><th>Volume</th><th>Entry Price</th><th>Current Price</th><th>P/L</th><th>Bot</th><th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagePositions.map((position) => {
                      const pl = Number(position.floating_pl ?? 0);
                      return (
                        <tr key={position.id}>
                          <td><input type="checkbox" aria-label={`Select ${position.canonical_symbol} position`} checked={selected.includes(position.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, position.id] : current.filter((id) => id !== position.id))} /></td>
                          <td>
                            <span className="positions-symbol">
                              <span className={`positions-symbol-icon positions-symbol-${getCategory(symbolCategories.get(position.canonical_symbol.toUpperCase()) ?? symbolCategories.get(position.broker_symbol.toUpperCase()))}`}>
                                {position.canonical_symbol.slice(0, 1)}
                              </span>
                              <span><strong>{position.canonical_symbol}</strong><small>{position.broker_symbol}</small></span>
                            </span>
                          </td>
                          <td><span className={`positions-side ${position.side}`}>{position.side === 'buy' ? '↑ Buy' : '↓ Sell'}</span></td>
                          <td>{position.volume}</td>
                          <td>{position.entry_price}</td>
                          <td>{position.current_price ?? '—'}</td>
                          <td className={pl >= 0 ? 'positions-positive' : 'positions-negative'}>{position.floating_pl === null ? '—' : `${pl > 0 ? '+' : pl < 0 ? '−' : ''}${formatAmount(pl)}`}</td>
                          <td><Link to={`/app/bots/${position.bot_id}`} className="positions-bot-link"><Icon name="bot" size={15} />{position.bot_name}</Link></td>
                          <td><button type="button" className="positions-manage" onClick={() => void closeOne(position)} disabled={busy}>Close</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="positions-table-footer">
                <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredPositions.length)} of {filteredPositions.length} positions</span>
                <div className="positions-pagination">
                  <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹</button>
                  <span>{page} / {pageCount}</span>
                  <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>›</button>
                </div>
              </div>
            </>
          )}
        </div>

        <aside className="positions-side-panels">
          <article className="positions-side-card">
            <div className="positions-card-heading"><Icon name="analytics" size={19} /><h2>Portfolio Overview</h2></div>
            <PortfolioSparkline data={dailyPnl} />
            <div className="positions-portfolio-footer">
              <span>30-day realized P/L</span>
              <strong>{dailyPnl.length ? `${dailyPnl.reduce((sum, item) => sum + Number(item.pnl), 0) >= 0 ? '+' : '−'}${formatAmount(dailyPnl.reduce((sum, item) => sum + Number(item.pnl), 0))}` : '—'}</strong>
            </div>
          </article>
          <article className="positions-side-card">
            <div className="positions-card-heading"><Icon name="shield" size={19} /><h2>Risk Controls</h2></div>
            <div className="positions-risk-status">
              <span className={enabledRiskControls > 0 ? 'risk-indicator-active' : ''} />
              {enabledRiskControls > 0 ? 'Limits configured' : 'No running bots'}
            </div>
            <p className="positions-risk-copy">
              {enabledRiskControls > 0
                ? `${enabledRiskControls} running bot${enabledRiskControls === 1 ? '' : 's'} have daily loss, drawdown, and margin limits set.`
                : 'Start a configured bot to monitor its risk limits here.'}
            </p>
            <Link to="/app/bots" className="positions-side-link">Review bot risk settings <Icon name="arrow-right" size={13} /></Link>
          </article>
          <article className="positions-side-card positions-quick-card">
            <div className="positions-card-heading"><Icon name="rocket" size={19} /><h2>Quick Actions</h2></div>
            <Link to="/app/history"><Icon name="history" size={15} /> View Trade History <Icon name="arrow-right" size={13} /></Link>
            <Link to="/app/performance"><Icon name="performance" size={15} /> View Performance <Icon name="arrow-right" size={13} /></Link>
            <Link to="/app/bots"><Icon name="bot" size={15} /> Manage Trading Bots <Icon name="arrow-right" size={13} /></Link>
          </article>
        </aside>
      </section>

      <footer className="positions-tip">
        <Icon name="shield" size={18} />
        <p><strong>Risk reminder:</strong> Floating P/L can change quickly. Review your risk limits before closing or modifying a trade.</p>
        <Link to="/app/history">View trade history <Icon name="arrow-right" size={13} /></Link>
      </footer>
    </div>
  );
}
