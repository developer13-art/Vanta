import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { useToast } from '../../toast-context';
import type { BrokerAccount, BrokerSymbol } from '../../../shared/types';

const steps = [
  'Broker Account',
  'Instruments',
  'Trading Strategy',
  'Risk Settings',
  'Review & Create',
];

export function BotCreate(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);
  const [symbols, setSymbols] = useState<BrokerSymbol[]>([]);
  const [brokerId, setBrokerId] = useState('');
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [resourceLoading, setResourceLoading] = useState(true);
  const [symbolsLoading, setSymbolsLoading] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    strategyName: 'ema_crossover',
    fastPeriod: 9,
    slowPeriod: 21,
    lotSize: 0.01,
    entryBatchSize: 1,
    maxConcurrentPositions: 1,
    dailyLossLimit: 50,
    drawdownLimit: 100,
    marginUtilizationLimit: 50,
    maxSpreadPoints: 30,
    cooldownSeconds: 60,
    stopBehavior: 'stop_new_manage_existing',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.listBrokers().then((items) => {
      if (!active) return;
      const connected = items.filter((broker) => broker.status === 'connected');
      setBrokers(connected);
      setBrokerId(connected[0]?.id ?? '');
    }).catch(() => {
      if (active) setResourceError('Could not load broker accounts. Refresh the page to try again.');
    }).finally(() => {
      if (active) setResourceLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setSelectedSymbols([]);
    if (!brokerId) {
      setSymbols([]);
      return () => { active = false; };
    }
    setSymbolsLoading(true);
    api.brokerSymbols(brokerId).then((items) => {
      if (active) setSymbols(items);
    }).catch(() => {
      if (active) setResourceError('Could not load instruments for this account.');
    }).finally(() => {
      if (active) setSymbolsLoading(false);
    });
    return () => { active = false; };
  }, [brokerId]);

  const selectedBroker = brokers.find((broker) => broker.id === brokerId);
  const selectedInstrumentRows = useMemo(
    () => symbols.filter((symbol) => selectedSymbols.includes(symbol.id)),
    [selectedSymbols, symbols],
  );

  const set = <K extends keyof typeof form>(key: K, value: typeof form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const validateStep = (): boolean => {
    if (step === 0) {
      if (!brokerId) { setError('Select a connected broker account.'); return false; }
      if (form.name.trim().length < 2) { setError('Enter a bot name with at least 2 characters.'); return false; }
      if (selectedBroker?.mode === 'live' && !selectedBroker.trading_enabled) {
        setError('Authorize live trading for this account before creating a bot.');
        return false;
      }
    }
    if (step === 1) {
      if (selectedSymbols.length === 0) { setError('Select at least one instrument.'); return false; }
      if (selectedSymbols.length > 20) { setError('A bot can use up to 20 instruments.'); return false; }
    }
    if (step === 2) {
      if (!Number.isInteger(form.fastPeriod) || form.fastPeriod < 2 || form.fastPeriod > 100) {
        setError('The fast EMA period must be a whole number between 2 and 100.');
        return false;
      }
      if (!Number.isInteger(form.slowPeriod) || form.slowPeriod < 5 || form.slowPeriod > 300) {
        setError('The slow EMA period must be a whole number between 5 and 300.');
        return false;
      }
      if (form.fastPeriod >= form.slowPeriod) {
        setError('The fast EMA period must be smaller than the slow EMA period.');
        return false;
      }
    }
    if (step === 3) {
      if (form.dailyLossLimit <= 0 || form.drawdownLimit <= 0 || form.lotSize <= 0) {
        setError('Lot size and loss limits must be greater than zero.');
        return false;
      }
      if (!Number.isInteger(form.entryBatchSize) || form.entryBatchSize < 1 || form.entryBatchSize > 20) {
        setError('Entry batch size must be a whole number between 1 and 20.');
        return false;
      }
      if (!Number.isInteger(form.maxConcurrentPositions) || form.maxConcurrentPositions < 1 || form.maxConcurrentPositions > 50) {
        setError('Maximum concurrent positions must be a whole number between 1 and 50.');
        return false;
      }
      if (!Number.isInteger(form.maxSpreadPoints) || form.maxSpreadPoints < 0) {
        setError('Maximum spread must be a non-negative whole number.');
        return false;
      }
      if (!Number.isInteger(form.cooldownSeconds) || form.cooldownSeconds < 0 || form.cooldownSeconds > 86_400) {
        setError('Cooldown must be a whole number between 0 and 86,400 seconds.');
        return false;
      }
      if (form.marginUtilizationLimit < 1 || form.marginUtilizationLimit > 100) {
        setError('Margin utilization must be between 1% and 100%.');
        return false;
      }
    }
    setError(null);
    return true;
  };

  const next = () => {
    if (validateStep()) setStep((current) => Math.min(steps.length - 1, current + 1));
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step < steps.length - 1) {
      next();
      return;
    }
    if (!validateStep() || !brokerId) return;
    setError(null);
    setLoading(true);
    try {
      await api.createBot({
        brokerAccountId: brokerId,
        name: form.name.trim(),
        strategyName: form.strategyName,
        strategyParams: {
          fastPeriod: form.fastPeriod,
          slowPeriod: form.slowPeriod,
          minSpreadPoints: form.maxSpreadPoints,
        },
        brokerSymbolIds: selectedSymbols,
        lotSize: form.lotSize,
        entryBatchSize: form.entryBatchSize,
        maxConcurrentPositions: form.maxConcurrentPositions,
        dailyLossLimit: form.dailyLossLimit,
        drawdownLimit: form.drawdownLimit,
        marginUtilizationLimit: form.marginUtilizationLimit,
        maxSpreadPoints: form.maxSpreadPoints,
        cooldownSeconds: form.cooldownSeconds,
        stopBehavior: form.stopBehavior,
      });
      toast.success('Bot created in Ready state');
      navigate('/app/bots');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create the bot.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bot-create-page">
      {resourceError && <div className="bot-create-alert" role="status">{resourceError}</div>}
      <header className="bot-create-heading">
        <Link to="/app/bots" className="bot-create-back"><span>‹</span> Back to bots</Link>
        <div><span className="bot-create-eyebrow">BOT CONFIGURATION</span><h1>Create a Trading Bot</h1><p>Configure your strategy and risk controls before creating the bot.</p></div>
      </header>

      <ol className={`bot-create-steps step-${step}`} aria-label="Bot setup progress">
        {steps.map((label, index) => (
          <li key={label} className={index === step ? 'active' : index < step ? 'complete' : ''}>
            <span className="bot-step-marker">{index < step ? <Icon name="shield" size={14} /> : index + 1}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      <form className="bot-create-form" onSubmit={onSubmit}>
        <div className="bot-create-main">
          {step === 0 && (
            <section className="bot-create-card">
              <div className="bot-create-card-heading"><span className="bot-create-card-icon"><Icon name="broker" size={21} /></span><div><h2>Select a Broker Account</h2><p>Choose the connected account this bot will trade on.</p></div></div>
              {resourceLoading ? <div className="bot-create-loading">Loading accounts…</div> : brokers.length === 0 ? (
                <div className="bot-create-empty">
                  <p>No connected broker accounts are available.</p>
                  <Link to="/app/brokers/new" className="bot-create-inline-link">Connect a broker account <Icon name="arrow-right" size={14} /></Link>
                </div>
              ) : (
                <>
                  <Input label="Bot name" required maxLength={100} value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="e.g. EURUSD Trend Bot" />
                  <div className="bot-choice-list">
                    {brokers.map((broker) => (
                      <button type="button" className={`bot-choice-card${brokerId === broker.id ? ' selected' : ''}`} key={broker.id} onClick={() => setBrokerId(broker.id)}>
                        <span className="bot-choice-icon"><Icon name="broker" size={20} /></span>
                        <span className="bot-choice-copy"><strong>{broker.label}</strong><small>{broker.broker_name} · {broker.login}</small></span>
                        <span className={`bot-mode-tag ${broker.mode}`}>{broker.mode}</span>
                        <span className="bot-choice-check">{brokerId === broker.id ? '✓' : ''}</span>
                      </button>
                    ))}
                  </div>
                  {selectedBroker?.mode === 'live' && !selectedBroker.trading_enabled && (
                    <div className="bot-create-alert">Live trading is not authorized for this account. <Link to="/app/live-authorization">Review authorization</Link>.</div>
                  )}
                </>
              )}
            </section>
          )}

          {step === 1 && (
            <section className="bot-create-card">
              <div className="bot-create-card-heading"><span className="bot-create-card-icon"><Icon name="markets" size={21} /></span><div><h2>Select Instruments</h2><p>Choose the symbols this bot may analyze and trade. Select up to 20.</p></div><span className="bot-selection-count">{selectedSymbols.length} / 20 selected</span></div>
              {symbolsLoading ? <div className="bot-create-loading">Loading instruments…</div> : symbols.length === 0 ? (
                <div className="bot-create-empty"><p>No instruments have been discovered for this account.</p><Link to="/app/markets" className="bot-create-inline-link">Discover broker symbols <Icon name="arrow-right" size={14} /></Link></div>
              ) : (
                <div className="bot-instrument-grid">
                  {symbols.map((symbol) => {
                    const checked = selectedSymbols.includes(symbol.id);
                    return (
                      <label key={symbol.id} className={`bot-instrument-option${checked ? ' selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!checked && selectedSymbols.length >= 20}
                          onChange={(event) => setSelectedSymbols((current) => event.target.checked
                            ? [...current, symbol.id]
                            : current.filter((id) => id !== symbol.id))}
                        />
                        <span className="bot-instrument-symbol">{symbol.canonical_symbol.slice(0, 1)}</span>
                        <span><strong>{symbol.canonical_symbol}</strong><small>{symbol.category.replace(/_/g, ' ')}</small></span>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {step === 2 && (
            <section className="bot-create-card">
              <div className="bot-create-card-heading"><span className="bot-create-card-icon bot-strategy-icon"><Icon name="analytics" size={21} /></span><div><h2>Trading Strategy Configuration</h2><p>Configure the supported strategy’s crossover parameters.</p></div></div>
              <div className="bot-strategy-layout">
                <div className="bot-strategy-controls">
                  <div className="bot-config-block">
                    <div className="bot-config-heading"><h3>Strategy</h3><span>Currently supported</span></div>
                    <button type="button" className="bot-strategy-tile selected" onClick={() => set('strategyName', 'ema_crossover')}>
                      <span className="strategy-tile-icon"><Icon name="performance" size={21} /></span>
                      <span><strong>EMA Crossover</strong><small>Momentum crossover strategy</small></span>
                      <span className="strategy-tile-check">✓</span>
                    </button>
                    <p className="bot-config-note">This strategy compares fast and slow exponential moving averages. Other strategies are not available yet.</p>
                  </div>
                  <div className="bot-strategy-params">
                    <Input label="Fast EMA period" type="number" min="2" max="100" step="1" value={String(form.fastPeriod)} onChange={(event) => set('fastPeriod', Number(event.target.value))} />
                    <Input label="Slow EMA period" type="number" min="5" max="300" step="1" value={String(form.slowPeriod)} onChange={(event) => set('slowPeriod', Number(event.target.value))} />
                  </div>
                  <div className="bot-strategy-explainer">
                    <Icon name="shield" size={18} />
                    <p>Fast EMA crossing above the slow EMA produces a buy signal; crossing below produces a sell signal. Signals still pass through your risk limits.</p>
                  </div>
                </div>
                <aside className="bot-strategy-preview">
                  <div className="bot-preview-heading"><h3>Strategy Preview</h3><span>Illustrative</span></div>
                  <svg viewBox="0 0 340 145" role="img" aria-label="Illustrative EMA crossover chart, not live market data">
                    <g className="bot-preview-grid">{[20, 55, 90, 125].map((y) => <line key={y} x1="0" x2="340" y1={y} y2={y} />)}{[40, 100, 160, 220, 280].map((x) => <line key={x} x1={x} x2={x} y1="8" y2="137" />)}</g>
                    <path className="bot-preview-ema-slow" d="M5 108 C45 99 59 101 86 83 S125 74 148 79 183 91 206 70 245 62 266 48 308 40 335 28" />
                    <path className="bot-preview-ema-fast" d="M5 119 C33 111 51 84 78 90 S112 102 139 71 171 67 193 84 229 94 252 54 287 50 306 34 326 38 335 20" />
                    {[{ x: 25, y: 80, h: 35, up: true }, { x: 60, y: 68, h: 29, up: true }, { x: 95, y: 74, h: 38, up: false }, { x: 130, y: 63, h: 31, up: true }, { x: 165, y: 72, h: 44, up: false }, { x: 200, y: 51, h: 34, up: true }, { x: 235, y: 45, h: 28, up: true }, { x: 270, y: 38, h: 39, up: false }, { x: 305, y: 24, h: 33, up: true }].map((candle, index) => (
                      <g key={index} className={candle.up ? 'bot-preview-candle-up' : 'bot-preview-candle-down'}>
                        <line x1={candle.x + 7} x2={candle.x + 7} y1={candle.y - 7} y2={candle.y + candle.h + 7} />
                        <rect x={candle.x} y={candle.y} width="14" height={candle.h} rx="1" />
                      </g>
                    ))}
                  </svg>
                  <p>Illustration only; not a live chart or a performance forecast.</p>
                  <div className="bot-preview-rules"><strong>Signal behavior</strong><span>• Buy on bullish crossover</span><span>• Sell on bearish crossover</span><span>• Risk controls may block entries</span></div>
                </aside>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="bot-create-card">
              <div className="bot-create-card-heading"><span className="bot-create-card-icon bot-risk-icon"><Icon name="shield" size={21} /></span><div><h2>Risk Settings</h2><p>Set trade sizing, exposure limits, and stop behavior.</p></div></div>
              <div className="bot-risk-grid">
                <Input label="Lot size per order" type="number" step="0.01" min="0.01" required value={String(form.lotSize)} onChange={(event) => set('lotSize', Number(event.target.value))} />
                <Input label="Entry batch size" type="number" min="1" max="20" required value={String(form.entryBatchSize)} onChange={(event) => set('entryBatchSize', Number(event.target.value))} />
                <Input label="Maximum concurrent positions" type="number" min="1" max="50" required value={String(form.maxConcurrentPositions)} onChange={(event) => set('maxConcurrentPositions', Number(event.target.value))} />
                <Input label="Daily loss limit" type="number" step="0.01" min="0.01" required value={String(form.dailyLossLimit)} onChange={(event) => set('dailyLossLimit', Number(event.target.value))} />
                <Input label="Drawdown limit" type="number" step="0.01" min="0.01" required value={String(form.drawdownLimit)} onChange={(event) => set('drawdownLimit', Number(event.target.value))} />
                <Input label="Margin utilization limit (%)" type="number" min="1" max="100" required value={String(form.marginUtilizationLimit)} onChange={(event) => set('marginUtilizationLimit', Number(event.target.value))} />
                <Input label="Maximum spread (points)" type="number" min="0" required value={String(form.maxSpreadPoints)} onChange={(event) => set('maxSpreadPoints', Number(event.target.value))} />
                <Input label="Cooldown after a trade (seconds)" type="number" min="0" max="86400" required value={String(form.cooldownSeconds)} onChange={(event) => set('cooldownSeconds', Number(event.target.value))} />
                <Select label="When stopping the bot" value={form.stopBehavior} onChange={(event) => set('stopBehavior', event.target.value)} options={[
                  { value: 'stop_new_manage_existing', label: 'Stop new trades; manage existing' },
                  { value: 'close_all_and_stop', label: 'Close all positions and stop' },
                ]} />
              </div>
              <div className="bot-risk-note"><Icon name="shield" size={18} /><p>Risk limits are enforced independently of the strategy. Trading involves risk; limits do not guarantee against losses.</p></div>
            </section>
          )}

          {step === 4 && (
            <section className="bot-create-card">
              <div className="bot-create-card-heading"><span className="bot-create-card-icon"><Icon name="shield" size={21} /></span><div><h2>Review Your Bot</h2><p>Check your configuration before creating the bot.</p></div></div>
              <div className="bot-review-identity">
                <span className="bot-review-emblem"><Icon name="bot" size={25} /></span>
                <div><strong>{form.name || 'Unnamed bot'}</strong><span>{form.strategyName.replace(/_/g, ' ')} · {selectedBroker?.label ?? 'No account selected'}</span></div>
                <span className={`bot-mode-tag ${selectedBroker?.mode ?? 'demo'}`}>{selectedBroker?.mode ?? '—'}</span>
              </div>
              <div className="bot-review-grid">
                <div className="bot-review-group"><h3>Instruments <span>{selectedInstrumentRows.length}</span></h3>{selectedInstrumentRows.length ? <div className="bot-review-tags">{selectedInstrumentRows.map((symbol) => <span key={symbol.id}>{symbol.canonical_symbol}</span>)}</div> : <p>No instruments selected.</p>}</div>
                <div className="bot-review-group"><h3>Strategy parameters</h3><dl><div><dt>Fast EMA</dt><dd>{form.fastPeriod}</dd></div><div><dt>Slow EMA</dt><dd>{form.slowPeriod}</dd></div><div><dt>Maximum spread</dt><dd>{form.maxSpreadPoints} points</dd></div></dl></div>
                <div className="bot-review-group"><h3>Position sizing</h3><dl><div><dt>Lot size</dt><dd>{form.lotSize}</dd></div><div><dt>Entry batch</dt><dd>{form.entryBatchSize}</dd></div><div><dt>Max positions</dt><dd>{form.maxConcurrentPositions}</dd></div></dl></div>
                <div className="bot-review-group"><h3>Risk limits</h3><dl><div><dt>Daily loss</dt><dd>{form.dailyLossLimit}</dd></div><div><dt>Drawdown</dt><dd>{form.drawdownLimit}</dd></div><div><dt>Margin utilization</dt><dd>{form.marginUtilizationLimit}%</dd></div></dl></div>
              </div>
              <div className="bot-review-state"><Icon name="notifications" size={17} /><span>This creates the bot in <strong>Ready</strong> state. It will not begin trading until you start it.</span></div>
            </section>
          )}

          {error && <div className="bot-create-alert" role="alert">{error}</div>}

          <div className="bot-create-navigation">
            <button type="button" className="bot-previous-button" disabled={step === 0 || loading} onClick={() => { setError(null); setStep((current) => current - 1); }}>
              <Icon name="arrow-right" size={15} className="bot-previous-arrow" /> Previous
            </button>
            {step < steps.length - 1 ? (
              <Button type="button" onClick={next} disabled={resourceLoading || symbolsLoading}>
                Continue <Icon name="arrow-right" size={15} />
              </Button>
            ) : (
              <Button type="submit" loading={loading} disabled={!brokerId || selectedSymbols.length === 0}>
                Create Bot <Icon name="arrow-right" size={15} />
              </Button>
            )}
          </div>
        </div>

        <aside className="bot-create-sidebar">
          <section className="bot-create-card bot-create-summary">
            <div className="bot-summary-heading"><span className="bot-create-card-icon"><Icon name="analytics" size={19} /></span><h2>Configuration Summary</h2></div>
            <div className="bot-summary-row"><span>Bot name</span><strong>{form.name.trim() || 'Not set'}</strong></div>
            <div className="bot-summary-row"><span>Broker account</span><strong>{selectedBroker?.label ?? 'Not selected'}</strong></div>
            <div className="bot-summary-row"><span>Instruments</span><strong>{selectedSymbols.length} selected</strong></div>
            <div className="bot-summary-row"><span>Strategy</span><strong>EMA Crossover</strong></div>
            <div className="bot-summary-row"><span>Risk controls</span><strong>4 configured</strong></div>
            <div className="bot-summary-disclaimer">Review all limits carefully. Trading can result in losses.</div>
          </section>
          <section className="bot-create-side-tip">
            <Icon name="shield" size={19} />
            <div><strong>Built-in risk checks</strong><p>Every entry is subject to configured loss, drawdown, margin, and spread limits.</p></div>
          </section>
          <Link to="/risk-disclosure" className="bot-create-disclosure">Read the trading risk disclosure <Icon name="arrow-right" size={13} /></Link>
        </aside>
      </form>
    </div>
  );
}
