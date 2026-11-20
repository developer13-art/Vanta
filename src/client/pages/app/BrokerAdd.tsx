import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { useToast } from '../../toast-context';

export function BrokerAdd(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({
    label: '', brokerName: '', server: '', login: '', password: '', mode: 'demo' as 'demo' | 'live',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api.createBroker(form);
      toast.success('Account provisioning started');
      navigate(`/app/brokers/${r.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 className="page-title">Connect Broker Account</h1>
      <div className="card">
        <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 13 }}>
          We recommend starting with a demo account. Credentials are encrypted at rest and never shown again.
        </p>
        <form onSubmit={onSubmit}>
          <Input label="Account label" required value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="My Demo Account" />
          <Input label="Broker name" required value={form.brokerName} onChange={(e) => set('brokerName', e.target.value)} placeholder="ICMarkets" />
          <Input label="Server" required value={form.server} onChange={(e) => set('server', e.target.value)} placeholder="ICMarkets-Demo" />
          <Input label="Login" required value={form.login} onChange={(e) => set('login', e.target.value)} placeholder="12345678" />
          <Input label="Password" type="password" required value={form.password} onChange={(e) => set('password', e.target.value)} />
          <Select label="Account mode" value={form.mode} onChange={(e) => set('mode', e.target.value as 'demo' | 'live')} options={[
            { value: 'demo', label: 'Demo' },
            { value: 'live', label: 'Live' },
          ]} />
          {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
          <Button type="submit" loading={loading}>Connect Account</Button>
        </form>
      </div>
    </div>
  );
}