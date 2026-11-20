import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { useToast } from '../../toast-context';
import { Stat } from '../../components/Stat';
import type { BrokerAccount, BrokerSymbol } from '../../../shared/types';

export function BrokerDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [broker, setBroker] = useState<BrokerAccount | null>(null);
  const [symbols, setSymbols] = useState<BrokerSymbol[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [b, s] = await Promise.all([api.getBroker(id), api.brokerSymbols(id)]);
      setBroker(b); setSymbols(s);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [id]);

  if (loading || !broker) return <div>Loading…</div>;

  const doAction = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); toast.success(`${label} succeeded`); await load(); }
    catch (err) { toast.error(err instanceof ApiRequestError ? err.message : `${label} failed`); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>{broker.label}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Badge kind={broker.mode === 'live' ? 'danger' : 'info'}>{broker.mode}</Badge>
          <Badge kind={broker.status === 'connected' ? 'success' : 'warn'}>{broker.status}</Badge>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <Stat label="Balance" value={`${broker.account_balance ?? '—'} ${broker.account_currency ?? ''}`} />
        <Stat label="Equity" value={broker.account_equity ?? '—'} />
        <Stat label="Free margin" value={broker.account_free_margin ?? '—'} />
        <Stat label="Used margin" value={broker.account_used_margin ?? '—'} />
        <Stat label="Leverage" value={broker.account_leverage ?? '—'} />
        <Stat label="Margin mode" value={broker.is_hedging ? 'Hedging' : 'Netting'} />
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">Actions</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" loading={busy} onClick={() => doAction('Refresh health', () => api.refreshHealth(broker.id))}>Refresh Health</Button>
          <Button variant="secondary" loading={busy} onClick={() => doAction('Discover symbols', () => api.discoverSymbols(broker.id))}>Discover Symbols</Button>
          {broker.mode === 'live' && !broker.trading_enabled && (
            <Button onClick={() => navigate('/app/live-authorization')}>Authorize Live Trading</Button>
          )}
          <Button variant="danger" loading={busy} onClick={async () => {
            if (!confirm(`Delete broker account ${broker.label}? This cannot be undone.`)) return;
            try { await api.deleteBroker(broker.id); navigate('/app/brokers'); }
            catch (err) { toast.error(err instanceof ApiRequestError ? err.message : 'Delete failed'); }
          }}>Delete Account</Button>
        </div>
        {broker.last_error && <div style={{ marginTop: 12, color: 'var(--danger)', fontSize: 13 }}>{broker.last_error}</div>}
      </div>

      <div className="card">
        <div className="card-title">Discovered Symbols ({symbols.length})</div>
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>Symbol</th><th>Broker</th><th>Category</th><th>Min/Max</th><th>Step</th></tr></thead>
            <tbody>
              {symbols.slice(0, 200).map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.canonical_symbol}</strong></td>
                  <td style={{ color: 'var(--text-muted)' }}>{s.broker_symbol}</td>
                  <td>{s.category}</td>
                  <td>{s.min_volume}/{s.max_volume}</td>
                  <td>{s.volume_step}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}