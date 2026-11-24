import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { AccountHealthBadge } from '../../components/AccountHealthBadge';
import { Badge } from '../../components/Badge';

export function AdminBrokerAccounts(): JSX.Element {
  const [users, setUsers] = useState<Awaited<ReturnType<typeof api.adminListUsers>>>([]);
  const [brokers, setBrokers] = useState<Array<{
    id: string; user_id: string; label: string; broker_name: string;
    server: string; login: string; mode: string; status: string;
    connection_provider: string; platform: string | null; provider_account_id: string | null;
    last_health_status: string | null;
    last_error: string | null; created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.adminListUsers(),
      fetch('/api/admin/broker-accounts', {
        headers: { Authorization: `Bearer ${localStorage.getItem('vanta.access')}` },
      }).then((r) => r.ok ? r.json() : Promise.resolve([])),
    ]).then(([u, b]) => { setUsers(u); setBrokers(b); }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading…</div>;

  const emailById = new Map(users.map((u) => [u.id, u.email]));

  return (
    <div>
      <h1 className="page-title">Broker Accounts</h1>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Label</th><th>User</th><th>Broker</th><th>Login</th>
              <th>Platform</th><th>Provider</th><th>Mode</th><th>Status</th><th>Provider ID</th>
            </tr>
          </thead>
          <tbody>
            {brokers.map((b) => (
              <tr key={b.id}>
                <td>{b.label}</td>
                <td>{emailById.get(b.user_id) ?? b.user_id.slice(0, 8)}</td>
                <td>{b.broker_name}</td>
                <td>{b.login}</td>
                <td>{b.platform?.toUpperCase() ?? '—'}</td>
                <td>{b.connection_provider === 'fxapis' ? 'FXAPIs' : 'MetaApi'}</td>
                <td><Badge kind={b.mode === 'live' ? 'danger' : 'info'}>{b.mode}</Badge></td>
                <td><AccountHealthBadge status={b.status as never} /></td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.provider_account_id ? `${b.provider_account_id.slice(0, 12)}…` : '—'}</td>
              </tr>
            ))}
            {brokers.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No broker accounts</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}