import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { useToast } from '../../toast-context';
import { Stat } from '../../components/Stat';

type Tab = 'overview' | 'positions' | 'decisions' | 'config';

export function BotDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getBot>> | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    const d = await api.getBot(id);
    setData(d);
  };

  useEffect(() => { void load(); }, [id]);

  if (!data) return <div>Loading…</div>;

  const { bot, instruments, openPositions, recentDecisions } = data;

  const doAction = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); toast.success(`${label} succeeded`); await load(); }
    catch (err) { toast.error(err instanceof ApiRequestError ? err.message : `${label} failed`); }
    finally { setBusy(false); }
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

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {(['overview', 'positions', 'decisions', 'config'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
            padding: '10px 16px', fontSize: 13, fontWeight: 500,
            borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
          }}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          <div className="grid-3" style={{ marginBottom: 24 }}>
            <Stat label="Strategy" value={`${bot.strategy_name} v${bot.strategy_version}`} />
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
          <div className="card-title">Configuration</div>
          <table className="table">
            <tbody>
              <tr><td>Daily loss limit</td><td>{bot.daily_loss_limit}</td></tr>
              <tr><td>Drawdown limit</td><td>{bot.drawdown_limit}</td></tr>
              <tr><td>Margin utilization limit</td><td>{bot.margin_utilization_limit}%</td></tr>
              <tr><td>Max spread</td><td>{bot.max_spread_points ?? '—'}</td></tr>
              <tr><td>Cooldown</td><td>{bot.cooldown_seconds}s</td></tr>
              <tr><td>Stop behavior</td><td>{bot.stop_behavior}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}