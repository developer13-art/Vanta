import React, { useEffect, useState } from 'react';
import { Badge } from '../../components/Badge';

export function AdminInfrastructure(): JSX.Element {
  const [data, setData] = useState<{
    db_ok: boolean;
    jobs: Array<{ status: string; count: number }>;
    uptime_seconds: number;
    memory_mb: number;
  } | null>(null);

  useEffect(() => {
    fetch('/api/admin/infrastructure', {
      headers: { Authorization: `Bearer ${localStorage.getItem('vanta.access')}` },
    }).then((r) => r.ok ? r.json() : Promise.resolve(null))
      .then(setData);
  }, []);

  if (!data) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-title">Infrastructure</h1>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat">
          <div className="stat-label">Database</div>
          <div className="stat-value">
            <Badge kind={data.db_ok ? 'success' : 'danger'}>{data.db_ok ? 'Healthy' : 'Down'}</Badge>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Uptime</div>
          <div className="stat-value">{Math.floor(data.uptime_seconds / 60)} min</div>
        </div>
        <div className="stat">
          <div className="stat-label">Memory</div>
          <div className="stat-value">{data.memory_mb.toFixed(1)} MB</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Job Queue</div>
        <table className="table">
          <thead><tr><th>Status</th><th>Count</th></tr></thead>
          <tbody>
            {data.jobs.map((j) => (
              <tr key={j.status}>
                <td>
                  <Badge kind={j.status === 'failed' ? 'danger' : j.status === 'running' ? 'info' : 'muted'}>{j.status}</Badge>
                </td>
                <td>{j.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}