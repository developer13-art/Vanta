import React, { useEffect, useState } from 'react';
import { Badge } from '../../components/Badge';
import { api } from '../../api';

export function AdminSecurity(): JSX.Element {
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof api.adminAuditLog>>>([]);
  const [loginEvents, setLoginEvents] = useState<Array<{
    id: string; user_id: string; ip_address: string | null;
    success: boolean; reason: string | null; created_at: string;
  }>>([]);

  useEffect(() => {
    Promise.all([
      api.adminAuditLog(),
      fetch('/api/admin/login-events', {
        headers: { Authorization: `Bearer ${localStorage.getItem('vanta.access')}` },
      }).then((r) => r.ok ? r.json() : Promise.resolve([])),
    ]).then(([a, l]) => { setAudit(a); setLoginEvents(l); });
  }, []);

  return (
    <div>
      <h1 className="page-title">Security & Audit</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Recent Login Events</div>
        <table className="table">
          <thead><tr><th>Time</th><th>User</th><th>IP</th><th>Result</th><th>Reason</th></tr></thead>
          <tbody>
            {loginEvents.slice(0, 100).map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.created_at).toLocaleString()}</td>
                <td style={{ fontSize: 11 }}>{l.user_id.slice(0, 8)}</td>
                <td>{l.ip_address ?? '—'}</td>
                <td><Badge kind={l.success ? 'success' : 'danger'}>{l.success ? 'success' : 'failed'}</Badge></td>
                <td>{l.reason ?? '—'}</td>
              </tr>
            ))}
            {loginEvents.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No login events</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title">Audit Log</div>
        <table className="table">
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
          <tbody>
            {audit.slice(0, 100).map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.actor_type}{r.actor_id ? `:${r.actor_id.slice(0, 8)}` : ''}</td>
                <td>{r.action}</td>
                <td>{r.target_type}{r.target_id ? `:${r.target_id.slice(0, 8)}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}