import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Icon } from '../../components/Icon';
import type { BrokerAccount, BrokerSymbol, Candle } from '../../../shared/types';

const CATEGORIES = [
  { value: 'all', label: 'All markets' },
  { value: 'forex_major', label: 'Forex majors' },
  { value: 'forex_minor', label: 'Forex minors' },
  { value: 'forex_exotic', label: 'Forex exotics' },
  { value: 'metal', label: 'Metals' },
  { value: 'index', label: 'Indices' },
  { value: 'energy', label: 'Energy' },
  { value: 'crypto_cfd', label: 'Crypto CFDs' },
  { value: 'other', label: 'Other' },
];

const TIMEFRAMES = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
] as const;

type Timeframe = typeof TIMEFRAMES[number]['value'];

function formatPrice(value: number, digits: number | null): string {
  const precision = digits === null ? 3 : Math.max(0, Math.min(8, digits));
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value);
}

function CandleChart({ candles, digits }: { candles: Candle[]; digits: number | null }): JSX.Element {
  const width = 720;
  const height = 220;
  const left = 12;
  const right = 708;
  const top = 14;
  const bottom = 185;
  const highest = Math.max(...candles.map((candle) => candle.high));
  const lowest = Math.min(...candles.map((candle) => candle.low));
  const span = highest - lowest || Math.max(Math.abs(highest) * 0.001, 1);
  const y = (price: number) => bottom - ((price - lowest) / span) * (bottom - top);
  const step = (right - left) / Math.max(candles.length, 1);
  const bodyWidth = Math.max(1.5, Math.min(7, step * 0.58));
  const labels = [0, Math.floor((candles.length - 1) / 2), candles.length - 1]
    .filter((index, position, all) => all.indexOf(index) === position);

  return (
    <svg
      className="markets-candle-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Candlestick chart showing ${candles.length} historical market candles`}
    >
      {[0, 1, 2, 3].map((line) => {
        const lineY = top + ((bottom - top) * line) / 3;
        const price = highest - (span * line) / 3;
        return (
          <g key={line}>
            <line className="markets-chart-grid" x1={left} x2={right} y1={lineY} y2={lineY} />
            <text className="markets-chart-axis" x={right} y={lineY - 4} textAnchor="end">{formatPrice(price, digits)}</text>
          </g>
        );
      })}
      {candles.map((candle, index) => {
        const x = left + (index + 0.5) * step;
        const openY = y(candle.open);
        const closeY = y(candle.close);
        const rising = candle.close >= candle.open;
        const bodyY = Math.min(openY, closeY);
        const bodyHeight = Math.max(1, Math.abs(closeY - openY));
        return (
          <g className={rising ? 'markets-candle-up' : 'markets-candle-down'} key={`${candle.time}-${index}`}>
            <line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} />
            <rect x={x - bodyWidth / 2} y={bodyY} width={bodyWidth} height={bodyHeight} rx="1" />
          </g>
        );
      })}
      {labels.map((index) => {
        const candle = candles[index];
        if (!candle) return null;
        return (
          <text
            className="markets-chart-date"
            key={index}
            x={left + (index + 0.5) * step}
            y="210"
            textAnchor={index === 0 ? 'start' : index === candles.length - 1 ? 'end' : 'middle'}
          >
            {new Date(candle.time * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </text>
        );
      })}
    </svg>
  );
}

export function Markets(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [brokerAccounts, setBrokerAccounts] = useState<BrokerAccount[]>([]);
  const [symbols, setSymbols] = useState<BrokerSymbol[]>([]);
  const [selectedSymbolId, setSelectedSymbolId] = useState('');
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const [candleRetry, setCandleRetry] = useState(0);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loadingSymbols, setLoadingSymbols] = useState(true);
  const [discoveringSymbols, setDiscoveringSymbols] = useState(false);
  const [loadingCandles, setLoadingCandles] = useState(false);
  const [symbolsError, setSymbolsError] = useState<string | null>(null);
  const [candlesError, setCandlesError] = useState<string | null>(null);

  useEffect(() => {
    setSearch(searchParams.get('search') ?? '');
  }, [searchParams]);

  const loadSymbols = () => {
    let active = true;
    setLoadingSymbols(true);
    setSymbolsError(null);
    setDiscoveringSymbols(false);
    void (async () => {
      try {
        let items = await api.listSymbols();
        if (!active) return;

        if (items.length === 0) {
          const accounts = await api.listBrokers();
          if (!active) return;
          setBrokerAccounts(accounts);
          const connectedAccounts = accounts.filter((account) => account.status === 'connected');

          if (connectedAccounts.length > 0) {
            setDiscoveringSymbols(true);
            const discoveryErrors: unknown[] = [];
            for (const account of connectedAccounts) {
              if (!active) return;
              try {
                await api.discoverSymbols(account.id);
              } catch (error) {
                discoveryErrors.push(error);
              }
            }
            items = await api.listSymbols();
            if (items.length === 0 && discoveryErrors.length > 0) throw discoveryErrors[0];
          }
        }

        if (!active) return;
        setSymbols(items);
        setSelectedSymbolId((current) => items.some((item) => item.id === current) ? current : (items[0]?.id ?? ''));
      } catch (error: unknown) {
        if (active) setSymbolsError(error instanceof ApiRequestError ? error.message : 'Markets could not be loaded.');
      } finally {
        if (active) {
          setDiscoveringSymbols(false);
          setLoadingSymbols(false);
        }
      }
    })();
    return () => { active = false; };
  };

  useEffect(() => loadSymbols(), []);

  const selectedSymbol = symbols.find((symbol) => symbol.id === selectedSymbolId) ?? null;
  useEffect(() => {
    let active = true;
    if (!selectedSymbolId) {
      setCandles([]);
      setCandlesError(null);
      return () => { active = false; };
    }

    setLoadingCandles(true);
    setCandlesError(null);
    api.getCandles(selectedSymbolId, timeframe).then((result) => {
      if (active) setCandles([...result.candles].sort((a, b) => a.time - b.time));
    }).catch((error: unknown) => {
      if (active) {
        setCandles([]);
        setCandlesError(error instanceof ApiRequestError ? error.message : 'Historical candles could not be loaded.');
      }
    }).finally(() => {
      if (active) setLoadingCandles(false);
    });
    return () => { active = false; };
  }, [candleRetry, selectedSymbolId, timeframe]);

  const visibleSymbols = useMemo(() => {
    const query = search.trim().toLowerCase();
    return symbols.filter((symbol) => {
      const matchesCategory = category === 'all' || symbol.category === category;
      const matchesSearch = !query || `${symbol.canonical_symbol} ${symbol.broker_symbol} ${symbol.description ?? ''}`
        .toLowerCase()
        .includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [category, search, symbols]);
  const categoryCounts = useMemo(() => symbols.reduce<Record<string, number>>((counts, symbol) => {
    counts[symbol.category] = (counts[symbol.category] ?? 0) + 1;
    return counts;
  }, {}), [symbols]);
  const latestCandle = candles[candles.length - 1];
  const firstCandle = candles[0];
  const periodChange = latestCandle && firstCandle && firstCandle.open !== 0
    ? ((latestCandle.close - firstCandle.open) / firstCandle.open) * 100
    : null;
  const highestCandle = candles.length ? Math.max(...candles.map((candle) => candle.high)) : null;
  const lowestCandle = candles.length ? Math.min(...candles.map((candle) => candle.low)) : null;

  return (
    <div className="markets-page">
      <header className="markets-heading">
        <div className="markets-title-wrap">
          <span className="markets-title-icon"><Icon name="markets" size={23} /></span>
          <div>
            <span className="markets-eyebrow">BROKER-DISCOVERED INSTRUMENTS</span>
            <h1>Markets</h1>
            <p>Explore symbols available through your connected accounts.</p>
          </div>
        </div>
        <div className="markets-heading-meta">
          <span className="markets-live-indicator"><i /> Broker data</span>
          <span>{symbols.length} instrument{symbols.length === 1 ? '' : 's'}</span>
        </div>
      </header>

      <div className="markets-info-banner">
        <Icon name="analytics" size={16} />
        <p>Charts show historical broker candles. Live quotes and 24-hour market statistics are not available in this workspace.</p>
      </div>

      <section className="markets-workspace">
        <div className="markets-list-panel">
          <div className="markets-toolbar">
            <div className="markets-category-tabs" role="tablist" aria-label="Market categories">
              {CATEGORIES.map((item) => {
                const count = item.value === 'all' ? symbols.length : (categoryCounts[item.value] ?? 0);
                return (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={category === item.value}
                    className={category === item.value ? 'active' : ''}
                    key={item.value}
                    onClick={() => setCategory(item.value)}
                  >
                    {item.label}<span>{count}</span>
                  </button>
                );
              })}
            </div>
            <label className="markets-search">
              <Icon name="search" size={15} />
              <input aria-label="Search instruments" placeholder="Search instruments..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
          </div>

          {loadingSymbols ? (
            <div className="markets-empty-state"><span className="dashboard-spinner" /> {discoveringSymbols ? 'Discovering instruments from connected accounts…' : 'Loading broker instruments…'}</div>
          ) : symbolsError ? (
            <div className="markets-empty-state" role="alert">
              <strong>Markets unavailable</strong><p>{symbolsError}</p><button type="button" className="markets-retry" onClick={loadSymbols}>Try again</button>
            </div>
          ) : symbols.length === 0 ? (
            <div className="markets-empty-state">
              <span className="markets-empty-icon"><Icon name="markets" size={22} /></span>
              {brokerAccounts.length === 0 ? (
                <>
                  <strong>No broker accounts connected</strong>
                  <p>Connect a broker account to discover instruments for your market workspace.</p>
                  <Link to="/app/brokers/new">Connect a broker <Icon name="arrow-right" size={14} /></Link>
                </>
              ) : brokerAccounts.some((account) => account.status === 'connected') ? (
                <>
                  <strong>No instruments discovered yet</strong>
                  <p>Your connected account has no saved instruments. Try discovering its available symbols again.</p>
                  <button type="button" className="markets-retry" onClick={loadSymbols}>Discover symbols</button>
                </>
              ) : (
                <>
                  <strong>Broker account is not ready yet</strong>
                  <p>Markets will populate after a broker account finishes connecting.</p>
                  <Link to="/app/brokers">View broker accounts <Icon name="arrow-right" size={14} /></Link>
                  <button type="button" className="markets-retry" onClick={loadSymbols}>Check again</button>
                </>
              )}
            </div>
          ) : visibleSymbols.length === 0 ? (
            <div className="markets-empty-state"><strong>No matching instruments</strong><p>Try a different search or category.</p></div>
          ) : (
            <div className="markets-table-scroll">
              <table className="markets-table">
                <thead><tr><th>Instrument</th><th>Broker symbol</th><th>Category</th><th>Min volume</th><th>Volume step</th></tr></thead>
                <tbody>
                  {visibleSymbols.map((symbol, index) => (
                    <tr key={symbol.id} className={selectedSymbolId === symbol.id ? 'selected' : ''}>
                      <td>
                        <button type="button" className="markets-symbol-button" onClick={() => setSelectedSymbolId(symbol.id)} aria-pressed={selectedSymbolId === symbol.id}>
                          <span className={`markets-symbol-icon markets-symbol-${index % 4}`}>{symbol.canonical_symbol.slice(0, 1)}</span>
                          <span><strong>{symbol.canonical_symbol}</strong><small>{symbol.description ?? 'Broker instrument'}</small></span>
                        </button>
                      </td>
                      <td>{symbol.broker_symbol}</td>
                      <td><span className="markets-category-label">{symbol.category.replace(/_/g, ' ')}</span></td>
                      <td>{symbol.min_volume ?? '—'}</td>
                      <td>{symbol.volume_step ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loadingSymbols && !symbolsError && symbols.length > 0 && (
            <footer className="markets-list-footer">
              <span>Showing {visibleSymbols.length} of {symbols.length} discovered instruments</span>
              <span>Volume limits are provided by your broker</span>
            </footer>
          )}
        </div>

        <aside className="markets-detail-panel">
          {!selectedSymbol ? (
            <div className="markets-empty-state"><span className="markets-empty-icon"><Icon name="markets" size={22} /></span><strong>Select an instrument</strong><p>Choose a symbol to view its broker details and historical candles.</p></div>
          ) : (
            <>
              <div className="markets-detail-heading">
                <span className="markets-symbol-icon markets-symbol-detail">{selectedSymbol.canonical_symbol.slice(0, 1)}</span>
                <div><span className="markets-eyebrow">SELECTED INSTRUMENT</span><h2>{selectedSymbol.canonical_symbol}</h2><p>{selectedSymbol.description ?? selectedSymbol.category.replace(/_/g, ' ')}</p></div>
              </div>
              <div className="markets-detail-metrics">
                <div><span>Latest candle close</span><strong>{latestCandle ? formatPrice(latestCandle.close, selectedSymbol.digits) : '—'}</strong></div>
                <div><span>Change in displayed range</span><strong className={periodChange === null ? '' : periodChange >= 0 ? 'markets-positive' : 'markets-negative'}>
                  {periodChange === null ? '—' : `${periodChange >= 0 ? '+' : ''}${periodChange.toFixed(2)}%`}
                </strong></div>
                <div><span>Range high</span><strong>{highestCandle === null ? '—' : formatPrice(highestCandle, selectedSymbol.digits)}</strong></div>
                <div><span>Range low</span><strong>{lowestCandle === null ? '—' : formatPrice(lowestCandle, selectedSymbol.digits)}</strong></div>
              </div>

              <div className="markets-chart-panel">
                <div className="markets-chart-heading"><div><h3>Historical candles</h3><span>Most recent candles returned by the broker</span></div>
                  <div className="markets-timeframes" role="group" aria-label="Candle timeframe">
                    {TIMEFRAMES.map((item) => <button type="button" key={item.value} className={timeframe === item.value ? 'active' : ''} aria-pressed={timeframe === item.value} onClick={() => setTimeframe(item.value)}>{item.label}</button>)}
                  </div>
                </div>
                {loadingCandles ? <div className="markets-chart-message"><span className="dashboard-spinner" /> Loading candles…</div>
                  : candlesError ? <div className="markets-chart-message markets-chart-error" role="status"><span>{candlesError}</span><button type="button" className="markets-chart-retry" onClick={() => setCandleRetry((value) => value + 1)}>Retry</button></div>
                    : candles.length ? <CandleChart candles={candles} digits={selectedSymbol.digits} />
                      : <div className="markets-chart-message">No historical candles returned for this instrument.</div>}
              </div>

              <div className="markets-instrument-details">
                <h3>Broker specifications</h3>
                <dl>
                  <div><dt>Broker symbol</dt><dd>{selectedSymbol.broker_symbol}</dd></div>
                  <div><dt>Category</dt><dd>{selectedSymbol.category.replace(/_/g, ' ')}</dd></div>
                  <div><dt>Price digits</dt><dd>{selectedSymbol.digits ?? '—'}</dd></div>
                  <div><dt>Min / max volume</dt><dd>{selectedSymbol.min_volume ?? '—'} / {selectedSymbol.max_volume ?? '—'}</dd></div>
                </dl>
              </div>
              <Link to="/app/bots/new" className="markets-create-bot">Configure a bot <Icon name="arrow-right" size={15} /></Link>
            </>
          )}
        </aside>
      </section>
    </div>
  );
}
