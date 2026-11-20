import React, { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useToast } from '../../toast-context';
import { api, ApiRequestError } from '../../api';

export function AdminRiskControls(): JSX.Element {
  const [platformLimits, setPlatformLimits] = useState<Array<{
    limit_key: string; limit_value: string;
  }>>([]);
  const [form, setForm] = useState({ key: '', value: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = () => {
    fetch('/api/admin/risk-controls', {
      headers: { Authorization: `Bearer ${localStorage.getItem('vanta.access')}` },
    }).then((r) => r.ok ? r.json() : Promise.resolve([]))
      .then(setPlatformLimits);
  };
  useEffect(load, []);

  const save = async () => {
    if (!form.key || !form.value) return;
    setBusy(true);
    try {
      await fetch('/api/admin/risk-controls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('vanta.access')}`,
        },
        body: JSON.stringify({ key: form.key, value: Number(form.value) }),
      });
      toast.success('Saved');
      setForm({ key: '', value: '' });
      load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Save failed');
    } finally { setBusy(false); }
  };

  return (
    <div>
      <h1 className="page-title">Risk Controls (Platform)</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Platform Limits</div>
        <table className="table">
          <thead><tr><th>Key</th><th>Value</th></tr></thead>
          <tbody>
            {platformLimits.map((l) => (
              <tr key={l.limit_key}><td>{l.limit_key}</td><td>{l.limit_value}</td></tr>
            ))}
            {platformLimits.length === 0 && (
              <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No platform limits set</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title">Set / Update Platform Limit</div>
        <Input label="Limit key (e.g. max_positions)" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
        <Input label="Value" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
        <Button onClick={save} loading={busy}>Save</Button>
      </div>
    </div>
  );
}