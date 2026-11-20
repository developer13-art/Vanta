import React, { useEffect, useState } from 'react';
import { api, ApiRequestError } from '../../api';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { useToast } from '../../toast-context';

export function AdminUsers(): JSX.Element {
  const [users, setUsers] = useState<Awaited<ReturnType<typeof api.adminListUsers>>>([]);
  const [q, setQ] = useState('');
  const toast = useToast();

  const load = () => { api.adminListUsers(q).then(setUsers); };
  useEffect(load, [q]);

  const toggleStatus = async (id: string, current: string) => {
    try {
      if (current === 'active') await api.adminSuspendUser(id);
      else await api.adminReactivateUser(id);
      toast.success('User updated');
      load();
    } catch (err) { toast.error(err instanceof ApiRequestError ? err.message : 'Update failed'); }
  };

  return (
    <div>
      <h1 className="page-title">Users</h1>
      <div className="card">
        <div style={{ maxWidth: 400, marginBottom: 16 }}>
          <Input label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email or name" />
        </div>
        <table className="table">
          <thead><tr><th>Email</th><th>Name</th><th>Country</th><th>Status</th><th>Accounts</th><th>Bots</th><th>Credits</th><th></th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.full_name}</td>
              <td>{u.country}</td>
              <td><Badge kind={u.status === 'active' ? 'success' : 'danger'}>{u.status}</Badge></td>
              <td>{u.account_count}</td>
              <td>{u.bot_count}</td>
              <td>{u.credits ?? '—'}</td>
              <td>
                <Button size="sm" variant="secondary" onClick={() => toggleStatus(u.id, u.status)}>
                  {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                </Button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}