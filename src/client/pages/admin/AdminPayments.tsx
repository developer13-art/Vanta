import React, { useEffect, useState } from 'react';
import { Badge } from '../../components/Badge';

export function AdminPayments(): JSX.Element {
  const [rows, setRows] = useState<Array<{
    id: string; user_id: string; provider: string; provider_reference: string;
    package_code: string; credits_granted: number; amount: string; currency: string;
    status: string; paid_at: string | null; created_at: string;
  }>>([]);

  useEffect(() => {
    fetch('/api/admin/payments', {
      headers: { Authorization: `Bearer ${localStorage.getItem('vanta.access')}` },
    }).then((r) => r.ok ? r.json() : Promise.resolve([]))
      .then(setRows);
  }, []);

  return (
    <div>
      <h1 className="page-title">Payments</h1>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Time</th><th>User</th><th>Provider</th><th>Package</th><th>Credits</th><th>Amount</th><th>Status</th><th>Reference</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td style={{ fontSize: 11 }}>{r.user_id.slice(0, 8)}</td>
                <td>{r.provider}</td>
                <td>{r.package_code}</td>
                <td>{r.credits_granted}</td>
                <td>{r.amount} {r.currency}</td>
                <td>
                  <Badge kind={r.status === 'successful' ? 'success' : r.status === 'pending' ? 'info' : 'danger'}>{r.status}</Badge>
                </td>
                <td style={{ fontSize: 11 }}>{r.provider_reference}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No payments</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}