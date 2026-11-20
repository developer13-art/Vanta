import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { BotStateBadge } from '../../components/BotStateBadge';
import { Button } from '../../components/Button';

export function AdminBots(): JSX.Element {
  const [rows, setRows] = useState<Array<{
    id: string; user_id: string; name: string; state: string;
    broker_account_id: string; broker_account_label: string;
    open_positions: number; last_run_at: string | null; created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/bots', {
      headers: { Authorization: `Bearer ${localStorage.getItem('vanta.access')}` },
    }).then((r) => r.ok ? r.json() : Promise.resolve([]))
      .then(setRows)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const pause = async (id: string) => {
    await fetch(`/api/admin/bots/${id}/pause`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('vanta.access')}` },
    });
    load();
  };

  if (loading) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-title">Bots & Positions</h1>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Account</th><th>State</th><th>Open</th><th>Last run</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td>{b.name}</td>
                <td>{b.broker_account_label}</td>
                <td><BotStateBadge state={b.state as never} /></td>
                <td>{b.open_positions}</td>
                <td>{b.last_run_at ? new Date(b.last_run_at).toLocaleString() : '—'}</td>
                <td>
                  {b.state === 'running' && (
                    <Button size="sm" variant="secondary" onClick={() => pause(b.id)}>Pause</Button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No bots</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}