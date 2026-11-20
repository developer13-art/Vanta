import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useToast } from '../../toast-context';
import type { BrokerAccount } from '../../../shared/types';

export function LiveTradingAuthorization(): JSX.Element {
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    api.listBrokers().then((bs) => setBrokers(bs.filter((b) => b.mode === 'live' && !b.trading_enabled)));
  }, []);

  const onSubmit = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.authorizeLive(selectedId, phrase);
      toast.success('Live trading authorized');
      navigate('/app/brokers');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Authorization failed');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 className="page-title">Authorize Live Trading</h1>
      <div className="card">
        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
          Live trading executes real orders on your account. By authorizing, you accept full responsibility for real losses.
          Demo accounts are highly recommended first.
        </p>
        {brokers.length === 0 ? (
          <p>No live accounts pending authorization.</p>
        ) : (
          <>
            <div className="field">
              <label className="label">Select live account</label>
              <select className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">— Select —</option>
                {brokers.map((b) => (
                  <option key={b.id} value={b.id}>{b.label} ({b.broker_name})</option>
                ))}
              </select>
            </div>
            <Input label="Type AUTHORIZE LIVE TRADING to confirm" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
            <Button onClick={onSubmit} loading={busy} variant="danger" disabled={phrase !== 'AUTHORIZE LIVE TRADING' || !selectedId}>
              Authorize Live Trading
            </Button>
          </>
        )}
      </div>
    </div>
  );
}