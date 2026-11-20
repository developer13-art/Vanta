import React, { useEffect, useState } from 'react';
import { api } from '../../api';

export function AdminCredits(): JSX.Element {
  const [summary, setSummary] = useState<{
    totals: Array<{ event_type: string; total: number; count: number }>;
    recent: Array<{
      id: string; user_id: string; delta: number; balance_after: number;
      event_type: string; reason: string; created_at: string;
    }>;
  } | null>(null);

  useEffect(() => {
    fetch('/api/admin/credits', {
      headers: { Authorization: `Bearer ${localStorage.getItem('vanta.access')}` },
    }).then((r) => r.ok ? r.json() : Promise.resolve(null))
      .then(setSummary);
  }, []);

  if (!summary) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-title">Credit Economy</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Aggregates</div>
        <table className="table">
          <thead><tr><th>Event</th><th>Total credits</th><th>Count</th></tr></thead>
          <tbody>
            {summary.totals.map((t) => (
              <tr key={t.event_type}>
                <td>{t.event_type}</td>
                <td>{t.total}</td>
                <td>{t.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title">Recent Ledger Entries (last 200)</div>
        <table className="table">
          <thead><tr><th>Time</th><th>User</th><th>Event</th><th>Delta</th><th>Balance</th></tr></thead>
          <tbody>
            {summary.recent.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td style={{ fontSize: 11 }}>{r.user_id.slice(0, 8)}</td>
                <td>{r.event_type}</td>
                <td style={{ color: r.delta < 0 ? 'var(--danger)' : 'var(--success)' }}>{r.delta > 0 ? '+' : ''}{r.delta}</td>
                <td>{r.balance_after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}