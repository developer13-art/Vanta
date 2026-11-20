import React, { useEffect, useState } from 'react';

export function AdminAiStrategies(): JSX.Element {
  const [data, setData] = useState<{
    strategies: Array<{
      id: string; name: string; version: string; is_active: boolean;
      eligible_categories: string[]; created_at: string;
    }>;
    recent_decisions: Array<{
      id: string; bot_id: string; verdict: string; confidence: number | null;
      risk_outcome: string | null; rejected_by_validator: boolean; created_at: string;
    }>;
  } | null>(null);

  useEffect(() => {
    fetch('/api/admin/ai-strategies', {
      headers: { Authorization: `Bearer ${localStorage.getItem('vanta.access')}` },
    }).then((r) => r.ok ? r.json() : Promise.resolve(null))
      .then(setData);
  }, []);

  if (!data) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-title">AI & Strategies</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Strategy Versions</div>
        <table className="table">
          <thead><tr><th>Name</th><th>Version</th><th>Active</th><th>Categories</th></tr></thead>
          <tbody>
            {data.strategies.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.version}</td>
                <td>{s.is_active ? '✓' : '—'}</td>
                <td style={{ fontSize: 11 }}>{s.eligible_categories.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title">Recent Decisions (last 200)</div>
        <table className="table">
          <thead><tr><th>Time</th><th>Bot</th><th>Verdict</th><th>Conf.</th><th>Risk</th><th>Validator</th></tr></thead>
          <tbody>
            {data.recent_decisions.map((d) => (
              <tr key={d.id}>
                <td>{new Date(d.created_at).toLocaleString()}</td>
                <td style={{ fontSize: 11 }}>{d.bot_id.slice(0, 8)}</td>
                <td>{d.verdict}</td>
                <td>{d.confidence !== null ? `${(d.confidence * 100).toFixed(0)}%` : '—'}</td>
                <td>{d.risk_outcome ?? '—'}</td>
                <td>{d.rejected_by_validator ? '✗ rejected' : '✓ passed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}