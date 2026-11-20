import React, { useState } from 'react';
import { api, ApiRequestError } from '../../api';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { useToast } from '../../toast-context';

export function AdminEmergency(): JSX.Element {
  const [scope, setScope] = useState<'global' | 'user' | 'account'>('global');
  const [scopeId, setScopeId] = useState('');
  const [action, setAction] = useState<'halt_new_entries' | 'halt_all' | 'close_all'>('halt_new_entries');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async () => {
    if (!reason) { toast.error('Reason required'); return; }
    if (scope !== 'global' && !scopeId) { toast.error('Scope ID required'); return; }
    if (!confirm(`Activate ${action} for ${scope}${scopeId ? ` ${scopeId}` : ''}?`)) return;

    setBusy(true);
    try {
      await api.adminEmergencyHalt({ scope, scopeId: scope === 'global' ? null : scopeId, action, reason });
      toast.success('Emergency control activated');
      setReason('');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Failed');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 className="page-title">Emergency Controls</h1>
      <div className="card">
        <p style={{ color: 'var(--danger)', marginBottom: 16 }}>
          These actions pause bots immediately. Use with care — every activation is audited.
        </p>
        <Select label="Scope" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} options={[
          { value: 'global', label: 'Global' },
          { value: 'user', label: 'User' },
          { value: 'account', label: 'Broker Account' },
        ]} />
        {scope !== 'global' && (
          <Input label={`${scope === 'user' ? 'User' : 'Broker account'} ID`} value={scopeId} onChange={(e) => setScopeId(e.target.value)} />
        )}
        <Select label="Action" value={action} onChange={(e) => setAction(e.target.value as typeof action)} options={[
          { value: 'halt_new_entries', label: 'Halt new entries' },
          { value: 'halt_all', label: 'Halt all' },
          { value: 'close_all', label: 'Close all' },
        ]} />
        <Input label="Reason (audited)" required value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button variant="danger" onClick={submit} loading={busy}>Activate</Button>
      </div>
    </div>
  );
}