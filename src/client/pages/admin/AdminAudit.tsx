import React, { useEffect, useState } from 'react';
import { api } from '../../api';

export function AdminAudit(): JSX.Element {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.adminAuditLog>>>([]);
  useEffect(() => { api.adminAuditLog().then(setRows); }, []);

  return (
    <div>
      <h1 className="page-title">Audit Log</h1>
      <div className="card">
        <table className="table">
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.created_at).toLocaleString()}</td>
              <td>{r.actor_type}{r.actor_id ? `:${r.actor_id.slice(0, 8)}` : ''}</td>
              <td>{r.action}</td>
              <td>{r.target_type}{r.target_id ? `:${r.target_id.slice(0, 8)}` : ''}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}