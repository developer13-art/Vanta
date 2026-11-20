import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Badge } from './Badge';
import type { Wallet } from '../../shared/types';

interface Props {
  compact?: boolean;
  onLoaded?: (wallet: Wallet) => void;
}

export function WalletSummary({ compact, onLoaded }: Props): JSX.Element {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getWallet().then((w) => { setWallet(w); onLoaded?.(w); }).finally(() => setLoading(false));
  }, [onLoaded]);

  if (loading || !wallet) {
    return <div className="stat"><div className="stat-label">Credits</div><div className="stat-value">…</div></div>;
  }

  const ratio = wallet.lifetime_purchased > 0 ? wallet.available_credits / wallet.lifetime_purchased : 1;
  const severity: 'success' | 'warn' | 'danger' | 'muted' =
    wallet.available_credits === 0 ? 'danger' :
    ratio <= 0.10 ? 'danger' :
    ratio <= 0.20 ? 'warn' :
    'muted';

  if (compact) {
    return (
      <Link to="/app/wallet" style={{ color: 'var(--text)', display: 'flex', gap: 6, alignItems: 'center' }}>
        <Badge kind={severity === 'muted' ? 'info' : severity}>{wallet.available_credits}</Badge>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>credits</span>
      </Link>
    );
  }

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Credits</span>
        {severity !== 'muted' && <Badge kind={severity}>{severity === 'danger' ? 'Critical' : 'Low'}</Badge>}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{wallet.available_credits}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        {wallet.lifetime_purchased > 0 ? `${((wallet.available_credits / wallet.lifetime_purchased) * 100).toFixed(0)}% of purchased remaining` : 'No purchases yet'}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Link to="/app/wallet" className="btn btn-sm">Buy credits</Link>
        <Link to="/app/wallet" className="btn btn-secondary btn-sm">View ledger</Link>
      </div>
    </div>
  );
}