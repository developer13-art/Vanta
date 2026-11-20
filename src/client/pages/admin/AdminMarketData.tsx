import React, { useEffect, useState } from 'react';
import { Badge } from '../../components/Badge';

export function AdminMarketData(): JSX.Element {
  const [data, setData] = useState<{
    broker_accounts: Array<{
      id: string; label: string; broker_name: string; status: string;
      last_health_check_at: string | null; last_health_status: string | null;
      symbol_count: number;
    }>;
  } | null>(null);

  useEffect(() => {
    fetch('/api/admin/market-data', {
      headers: { Authorization: `Bearer ${localStorage.getItem('vanta.access')}` },
    }).then((r) => r.ok ? r.json() : Promise.resolve(null))
      .then(setData);
  }, []);

  if (!data) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-title">Market Data</h1>
      <div className="card">
        <div className="card-title">Feed health by broker account</div>
        <table className="table">
          <thead><tr><th>Label</th><th>Broker</th><th>Status</th><th>Last health</th><th>Symbols</th></tr></thead>
          <tbody>
            {data.broker_accounts.map((b) => (
              <tr key={b.id}>
                <td>{b.label}</td>
                <td>{b.broker_name}</td>
                <td><Badge kind={b.status === 'connected' ? 'success' : 'warn'}>{b.status}</Badge></td>
                <td>{b.last_health_check_at ? new Date(b.last_health_check_at).toLocaleString() : '—'}</td>
                <td>{b.symbol_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}