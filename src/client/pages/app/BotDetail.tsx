import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { useToast } from '../../toast-context';
import { Stat } from '../../components/Stat';
import type { BrokerSymbol, StopBehavior } from '../../../shared/types';

type Tab = 'overview' | 'positions' | 'decisions' | 'config';

interface BotEditForm {
  name: string;
  brokerSymbolIds: string[];
  lotSize: number;
  entryBatchSize: number;
  maxConcurrentPositions: number;
  dailyLossLimit: number;
  drawdownLimit: number;
  marginUtilizationLimit: number;
  maxSpreadPoints: number | null;
  cooldownSeconds: number;
  stopBehavior: StopBehavior;
}

export function BotDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getBot>> | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState(false);
  const [editForm, setEditForm] = useState<BotEditForm | null>(null);
  const [editSymbols, setEditSymbols] = useState<BrokerSymbol[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!id) return;
      try {
        const d = await api.getBot(id);
        if (active) {
          setData(d);
          setLoadError(null);
        }
      } catch {
        if (active) setLoadError('Bot activity could not be refreshed.');
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [id]);

  if (!data) return <div>{loadError ?? 'Loading…'}</div>;

  const { bot, instruments, openPositions, recentDecisions } = data;

  const doAction = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(`${label} succeeded`);
      const refreshed = await api.getBot(bot.id);
      setData(refreshed);
      setLoadError(null);
    }
    catch (err) { toast.error(err instanceof ApiRequestError ? err.message : `${label} failed`); }
    finally { setBusy(false); }
  };

  const canEditConfig = ['ready', 'paused', 'stopped', 'management_only', 'error'].includes(bot.state);
  const startEditingConfig = async () => {
    setBusy(true);
    setEditError(null);
    try {
      const symbols = await api.brokerSymbols(bot.broker_account_id);
      setEditSymbols(symbols);
      setEditForm({
        name: bot.name,
        brokerSymbolIds: instruments.map((instrument) => instrument.id),
        lotSize: Number(bot.lot_size),
        entryBatchSize: bot.entry_batch_size,
        maxConcurrentPositions: bot.max_concurrent_positions,
        dailyLossLimit: Number(bot.daily_loss_limit),
        drawdownLimit: Number(bot.drawdown_limit),
        marginUtilizationLimit: Number(bot.margin_utilization_limit),
        maxSpreadPoints: bot.max_spread_points,
        cooldownSeconds: bot.cooldown_seconds,
        stopBehavior: bot.stop_behavior,
      });
      setEditingConfig(true);
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : "Could not load this account's instruments.");
    } finally {
      setBusy(false);
    }
  };
  const updateEditForm = (changes: Partial<BotEditForm>) => {
    setEditForm((current) => current ? { ...current, ...changes } : current);
  };
  const saveConfiguration = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editForm) return;
    if (!canEditConfig) {
      setEditError('Pause or stop the bot before editing its configuration.');
      return;
    }
    if (editForm.brokerSymbolIds.length === 0) {
      setEditError('Select at least one instrument.');
      return;
    }
    setBusy(true);
    setEditError(null);
    try {
      await api.updateBot(bot.id, editForm);
      const refreshed = await api.getBot(bot.id);
      setData(refreshed);
      setEditingConfig(false);
      setEditForm(null);
      toast.success('Bot configuration updated');
    } catch (error) {
      setEditError(error instanceof ApiRequestError ? error.message : 'Bot configuration could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>{bot.name}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Badge kind={bot.state === 'running' ? 'success' : bot.state === 'error' ? 'danger' : 'muted'}>{bot.state}</Badge>
          <Badge kind={bot.is_live ? 'danger' : 'info'}>{bot.is_live ? 'LIVE' : 'DEMO'}</Badge>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {bot.state !== 'running' && (
          <Button loading={busy} onClick={() => doAction('Start', () => api.startBot(bot.id))}>Start</Button>
        )}
        {bot.state === 'running' && (
          <Button variant="secondary" loading={busy} onClick={() => doAction('Pause', () => api.pauseBot(bot.id))}>Pause</Button>
        )}
        <Button variant="secondary" loading={busy} onClick={() => doAction('Stop', () => api.stopBot(bot.id, 'stop_new_manage_existing'))}>
          Stop (manage existing)
        </Button>
        <Button variant="danger" loading={busy} onClick={async () => {
          if (!confirm('Close all positions and stop this bot?')) return;
          await doAction('Close & Stop', () => api.stopBot(bot.id, 'close_all_and_stop'));
        }}>Close All & Stop</Button>
        <Button variant="danger" loading={busy} onClick={async () => {
          if (!confirm('Delete this bot? (Must have zero open positions.)')) return;
          try { await api.deleteBot(bot.id); navigate('/app/bots'); }
          catch (err) { toast.error(err instanceof ApiRequestError ? err.message : 'Delete failed'); }
        }}>Delete</Button>
      </div>
      {loadError && <div className="bots-alert" role="status">{loadError}</div>}
      {recentDecisions[0] && (
        <div className="card bot-latest-feedback">
          <strong>Latest bot feedback · {recentDecisions[0].verdict}</strong>
          <span>{recentDecisions[0].reasoning_summary ?? recentDecisions[0].risk_reason ?? 'No additional details.'}</span>
          <small>{new Date(recentDecisions[0].created_at).toLocaleString()}</small>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {(['overview', 'positions', 'decisions', 'config'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
            padding: '10px 16px', fontSize: 13, fontWeight: 500,
            borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
          }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          <div className="grid-3" style={{ marginBottom: 24 }}>
            <Stat label="Analysis mode" value={`${bot.strategy_name === 'ai_adaptive' ? 'AI Adaptive' : bot.strategy_name} v${bot.strategy_version}`} />
            <Stat label="Lot size" value={bot.lot_size} />
            <Stat label="Batch size" value={bot.entry_batch_size} />
            <Stat label="Max positions" value={bot.max_concurrent_positions} />
            <Stat label="Open positions" value={openPositions.length} />
            <Stat label="Instruments" value={instruments.length} />
          </div>
          <div className="card">
            <div className="card-title">Instruments</div>
            {instruments.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No instruments</p> :
              instruments.map((i) => <div key={i.id} style={{ padding: '4px 0' }}>{i.canonical_symbol} ({i.category})</div>)}
          </div>
        </div>
      )}

      {tab === 'positions' && (
        <div className="card">
          <div className="card-title">Open Positions ({openPositions.length})</div>
          {openPositions.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No open positions</p> : (
            <table className="table">
              <thead><tr><th>Ticket</th><th>Symbol</th><th>Side</th><th>Volume</th><th>Entry</th><th>P/L</th><th>Opened</th></tr></thead>
              <tbody>{openPositions.map((p) => (
                <tr key={p.id}>
                  <td>{p.broker_ticket}</td>
                  <td>{p.broker_symbol}</td>
                  <td><Badge kind={p.side === 'buy' ? 'success' : 'danger'}>{p.side}</Badge></td>
                  <td>{p.volume}</td>
                  <td>{p.entry_price}</td>
                  <td style={{ color: Number(p.floating_pl ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>{p.floating_pl ?? '—'}</td>
                  <td>{new Date(p.opened_at).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'decisions' && (
        <div className="card">
          <div className="card-title">Recent Decisions ({recentDecisions.length})</div>
          {recentDecisions.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No decisions yet</p> : (
            <table className="table">
              <thead><tr><th>Time</th><th>Verdict</th><th>Confidence</th><th>Reason</th><th>Risk outcome</th></tr></thead>
              <tbody>{recentDecisions.map((d) => (
                <tr key={d.id}>
                  <td>{new Date(d.created_at).toLocaleString()}</td>
                  <td><Badge kind={d.verdict === 'BUY' ? 'success' : d.verdict === 'SELL' ? 'danger' : 'muted'}>{d.verdict}</Badge></td>
                  <td>{d.confidence !== null ? `${(d.confidence * 100).toFixed(0)}%` : '—'}</td>
                  <td style={{ fontSize: 12 }}>{d.reasoning_summary ?? '—'}</td>
                  <td>{d.risk_outcome ?? '—'}{d.risk_reason ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.risk_reason}</div> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'config' && (
        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>Configuration</span>
            {!editingConfig && (
              <Button variant="secondary" disabled={!canEditConfig || busy} loading={busy} onClick={() => { void startEditingConfig(); }}>
                Edit configuration
              </Button>
            )}
          </div>
          {editingConfig && editForm ? (
            <form onSubmit={(event) => { void saveConfiguration(event); }}>
              <p style={{ marginBottom: 14, color: 'var(--text-muted)' }}>
                Pause or stop the bot before saving. Existing positions are not closed by configuration changes.
              </p>
              <div className="grid-3">
                <Input label="Bot name" required minLength={2} maxLength={120} value={editForm.name}
                  onChange={(event) => updateEditForm({ name: event.target.value })} />
                <Input label="Lot size per order" type="number" step="0.01" min="0.0001" required value={editForm.lotSize}
                  onChange={(event) => updateEditForm({ lotSize: Number(event.target.value) })} />
                <Input label="Entry batch size" type="number" min="1" max="20" required value={editForm.entryBatchSize}
                  onChange={(event) => updateEditForm({ entryBatchSize: Number(event.target.value) })} />
                <Input label="Maximum concurrent positions" type="number" min="1" max="50" required value={editForm.maxConcurrentPositions}
                  onChange={(event) => updateEditForm({ maxConcurrentPositions: Number(event.target.value) })} />
                <Input label="Daily loss limit" type="number" step="0.01" min="0.01" required value={editForm.dailyLossLimit}
                  onChange={(event) => updateEditForm({ dailyLossLimit: Number(event.target.value) })} />
                <Input label="Drawdown limit" type="number" step="0.01" min="0.01" required value={editForm.drawdownLimit}
                  onChange={(event) => updateEditForm({ drawdownLimit: Number(event.target.value) })} />
                <Input label="Margin utilization limit (%)" type="number" min="1" max="100" required value={editForm.marginUtilizationLimit}
                  onChange={(event) => updateEditForm({ marginUtilizationLimit: Number(event.target.value) })} />
                <Input label="Maximum spread (points)" type="number" min="0" value={editForm.maxSpreadPoints ?? ''}
                  onChange={(event) => updateEditForm({ maxSpreadPoints: event.target.value === '' ? null : Number(event.target.value) })} />
                <Input label="Cooldown after a trade (seconds)" type="number" min="0" max="86400" required value={editForm.cooldownSeconds}
                  onChange={(event) => updateEditForm({ cooldownSeconds: Number(event.target.value) })} />
                <Select label="When stopping the bot" value={editForm.stopBehavior} onChange={(event) => updateEditForm({ stopBehavior: event.target.value as StopBehavior })} options={[
                  { value: 'stop_new_manage_existing', label: 'Stop new trades; manage existing' },
                  { value: 'close_all_and_stop', label: 'Close all positions and stop' },
                  { value: 'emergency_halt', label: 'Emergency halt' },
                ]} />
              </div>
              <h3 style={{ margin: '18px 0 10px' }}>Instruments</h3>
              <div className="bot-instrument-grid">
                {editSymbols.map((symbol) => {
                  const selected = editForm.brokerSymbolIds.includes(symbol.id);
                  return (
                    <label className={`bot-instrument-option${selected ? ' selected' : ''}`} key={symbol.id}>
                      <input type="checkbox" checked={selected} onChange={(event) => updateEditForm({
                        brokerSymbolIds: event.target.checked
                          ? [...editForm.brokerSymbolIds, symbol.id]
                          : editForm.brokerSymbolIds.filter((symbolId) => symbolId !== symbol.id),
                      })} />
                      <span className="bot-instrument-symbol">{symbol.canonical_symbol.slice(0, 1)}</span>
                      <span><strong>{symbol.canonical_symbol}</strong><small>{symbol.category.replace(/_/g, ' ')}</small></span>
                    </label>
                  );
                })}
              </div>
              {editError && <div className="bots-alert" role="alert" style={{ marginTop: 12 }}>{editError}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => { setEditingConfig(false); setEditForm(null); setEditError(null); }}>
                  Cancel
                </Button>
                <Button type="submit" loading={busy}>Save configuration</Button>
              </div>
            </form>
          ) : (
            <>
              {!canEditConfig && <p style={{ marginBottom: 12, color: 'var(--text-muted)' }}>Pause or stop this bot before editing its configuration.</p>}
              <table className="table">
                <tbody>
                  <tr><td>Bot name</td><td>{bot.name}</td></tr>
                  <tr><td>Lot size</td><td>{bot.lot_size}</td></tr>
                  <tr><td>Entry batch size</td><td>{bot.entry_batch_size}</td></tr>
                  <tr><td>Maximum concurrent positions</td><td>{bot.max_concurrent_positions}</td></tr>
                  <tr><td>Daily loss limit</td><td>{bot.daily_loss_limit}</td></tr>
                  <tr><td>Drawdown limit</td><td>{bot.drawdown_limit}</td></tr>
                  <tr><td>Margin utilization limit</td><td>{bot.margin_utilization_limit}%</td></tr>
                  <tr><td>Max spread</td><td>{bot.max_spread_points ?? '—'}</td></tr>
                  <tr><td>Cooldown</td><td>{bot.cooldown_seconds}s</td></tr>
                  <tr><td>Stop behavior</td><td>{bot.stop_behavior}</td></tr>
                  <tr><td>Instruments</td><td>{instruments.map((instrument) => instrument.canonical_symbol).join(', ') || '—'}</td></tr>
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}