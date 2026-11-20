import React, { useEffect, useState } from 'react';
import { api } from '../../api';

export function AdminJobs(): JSX.Element {
  const [stats, setStats] = useState<Array<{ status: string; count: number }>>([]);
  useEffect(() => { api.adminJobStats().then(setStats); }, []);

  return (
    <div>
      <h1 className="page-title">Job Queue</h1>
      <div className="card">
        <table className="table">
          <thead><tr><th>Status</th><th>Count</th></tr></thead>
          <tbody>{stats.map((s) => <tr key={s.status}><td>{s.status}</td><td>{s.count}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}