import React, { useEffect, useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';

export function AdminExecution(): JSX.Element {
  const [orders, setOrders] = useState<Array<{
    id: string; bot_id: string; broker_account_id: string; side: string;
    volume: string; status: string; broker_ticket: string | null;
    rejection_reason: string | null; created_at: string; acknowledged_at: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/orders?status=unknown', {
      headers: { Authorization: `Bearer ${localStorage.getItem('vanta.access')}` },
    }).then((r) => r.ok ? r.json() : Promise.resolve([]))
      .then(setOrders)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const reconcile = async (id: string) => {
    await fetch(`/api/admin/orders/${id}/reconcile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('vanta.access')}` },
    });
    load();
  };

  if (loading) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-title">Execution Operations</h1>
      <div className="card">
        <div className="card-title">Uncertain / Unknown Orders ({orders.length})</div>
        <table className="table">
          <thead>
            <tr><th>Created</th><th>Side</th><th>Volume</th><th>Status</th><th>Reason</th><th></th></tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{new Date(o.created_at).toLocaleString()}</td>
                <td><Badge kind={o.side === 'buy' ? 'success' : 'danger'}>{o.side}</Badge></td>
                <td>{o.volume}</td>
                <td><Badge kind="warn">{o.status}</Badge></td>
                <td style={{ fontSize: 12 }}>{o.rejection_reason ?? '—'}</td>
                <td><Button size="sm" variant="secondary" onClick={() => reconcile(o.id)}>Reconcile</Button></td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No uncertain orders</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}