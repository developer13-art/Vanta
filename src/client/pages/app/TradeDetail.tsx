import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { Badge } from '../../components/Badge';

interface TradeDetailData {
  position: {
    id: string; broker_ticket: string; side: string; volume: string;
    entry_price: string; close_price: string | null; realized_pl: string | null;
    commission: string; swap: string; opened_at: string; closed_at: string | null;
    closed_by: string | null; bot_name: string; strategy_name: string;
    strategy_version: string; canonical_symbol: string; broker_symbol: string;
    broker_account_label: string;
  };
  orders: Array<{
    id: string; side: string; volume: string; status: string;
    broker_ticket: string | null; filled_price: string | null;
    rejection_reason: string | null; created_at: string; filled_at: string | null;
  }>;
  decisions: Array<{
    id: string; verdict: string; confidence: number | null;
    reasoning_summary: string | null; risk_outcome: string | null;
    risk_reason: string | null; created_at: string;
  }>;
  ledger: Array<{
    id: string; event_type: string; delta: number; balance_after: number;
    reason: string; created_at: string;
  }>;
}

export function TradeDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<TradeDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/history/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('vanta.access')}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json() as Promise<TradeDetailData>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <div className="card"><p style={{ color: 'var(--danger)' }}>{error}</p></div>;
  if (!data) return <div>Loading…</div>;

  const p = data.position;
  const pl = Number(p.realized_pl ?? 0);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/app/history" style={{ fontSize: 13 }}>← Back to history</Link>
      </div>
      <h1 className="page-title">Trade {p.broker_ticket}</h1>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat"><div className="stat-label">Symbol</div><div className="stat-value">{p.canonical_symbol}</div></div>
        <div className="stat"><div className="stat-label">Side</div><div className="stat-value"><Badge kind={p.side === 'buy' ? 'success' : 'danger'}>{p.side}</Badge></div></div>
        <div className="stat"><div className="stat-label">Volume</div><div className="stat-value">{p.volume}</div></div>
        <div className="stat"><div className="stat-label">Entry</div><div className="stat-value">{p.entry_price}</div></div>
        <div className="stat"><div className="stat-label">Close</div><div className="stat-value">{p.close_price ?? '—'}</div></div>
        <div className="stat">
          <div className="stat-label">Realized P/L</div>
          <div className="stat-value" style={{ color: pl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{pl.toFixed(2)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Context</div>
        <table className="table"><tbody>
          <tr><td>Bot</td><td>{p.bot_name}</td></tr>
          <tr><td>Strategy</td><td>{p.strategy_name} v{p.strategy_version}</td></tr>
          <tr><td>Broker account</td><td>{p.broker_account_label}</td></tr>
          <tr><td>Broker symbol</td><td>{p.broker_symbol}</td></tr>
          <tr><td>Opened</td><td>{new Date(p.opened_at).toLocaleString()}</td></tr>
          <tr><td>Closed</td><td>{p.closed_at ? new Date(p.closed_at).toLocaleString() : '—'}</td></tr>
          <tr><td>Closed by</td><td>{p.closed_by ?? '—'}</td></tr>
          <tr><td>Commission</td><td>{p.commission}</td></tr>
          <tr><td>Swap</td><td>{p.swap}</td></tr>
        </tbody></table>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Timeline</div>
        <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 20 }}>
          {[...data.decisions].reverse().map((d) => (
            <div key={d.id} style={{ marginBottom: 16, position: 'relative' }}>
              <div style={{ position: 'absolute', left: -27, top: 6, width: 10, height: 10, borderRadius: '50%', background: d.verdict === 'BUY' ? 'var(--success)' : d.verdict === 'SELL' ? 'var(--danger)' : 'var(--text-muted)' }} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(d.created_at).toLocaleString()}</div>
              <div style={{ fontWeight: 500 }}>AI decision: {d.verdict}{d.confidence !== null ? ` (${(d.confidence * 100).toFixed(0)}%)` : ''}</div>
              {d.reasoning_summary && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.reasoning_summary}</div>}
              {d.risk_outcome && <div style={{ fontSize: 12 }}>Risk: {d.risk_outcome}{d.risk_reason ? ` — ${d.risk_reason}` : ''}</div>}
            </div>
          ))}

          {data.orders.map((o) => (
            <div key={o.id} style={{ marginBottom: 16, position: 'relative' }}>
              <div style={{ position: 'absolute', left: -27, top: 6, width: 10, height: 10, borderRadius: '50%', background: o.status === 'accepted' || o.status === 'filled' ? 'var(--primary)' : 'var(--danger)' }} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(o.created_at).toLocaleString()}</div>
              <div style={{ fontWeight: 500 }}>Order {o.side} {o.volume} — {o.status}</div>
              {o.filled_price && <div style={{ fontSize: 12 }}>Filled @ {o.filled_price} (ticket {o.broker_ticket})</div>}
              {o.rejection_reason && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{o.rejection_reason}</div>}
            </div>
          ))}

          {data.ledger.map((l) => (
            <div key={l.id} style={{ marginBottom: 16, position: 'relative' }}>
              <div style={{ position: 'absolute', left: -27, top: 6, width: 10, height: 10, borderRadius: '50%', background: 'var(--warn)' }} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(l.created_at).toLocaleString()}</div>
              <div style={{ fontWeight: 500 }}>Credits: {l.delta > 0 ? '+' : ''}{l.delta} ({l.event_type})</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.reason} — balance {l.balance_after}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}