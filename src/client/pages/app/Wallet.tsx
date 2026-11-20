import React, { useEffect, useState } from 'react';
import { api, ApiRequestError } from '../../api';
import { Button } from '../../components/Button';
import { Stat } from '../../components/Stat';
import { useToast } from '../../toast-context';
import type { Wallet as WalletType, CreditPackage, LedgerEntry, PackageCode } from '../../../shared/types';

export function Wallet(): JSX.Element {
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<PackageCode | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    Promise.all([api.getWallet(), api.listPackages(), api.getLedger(50, 0)])
      .then(([w, p, l]) => { setWallet(w); setPackages(p); setLedger(l); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const purchase = async (code: PackageCode) => {
    setBusy(code);
    try {
      const r = await api.purchase(code);
      window.location.href = r.authorizationUrl;
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Purchase failed');
      setBusy(null);
    }
  };

  if (loading || !wallet) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-title">Wallet & Credits</h1>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <Stat label="Available credits" value={wallet.available_credits} />
        <Stat label="Reserved" value={wallet.reserved_credits} />
        <Stat label="Lifetime purchased" value={wallet.lifetime_purchased} />
        <Stat label="Lifetime used" value={wallet.lifetime_used} />
      </div>

      <div className="card" id="buy-credits" style={{ marginBottom: 24 }}>
        <div className="card-title">Buy Credits</div>
        <div className="grid-3">
          {packages.map((p) => (
            <div key={p.code} className="card">
              <div style={{ textTransform: 'capitalize', fontWeight: 600, marginBottom: 8 }}>{p.code}</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{p.credits.toLocaleString()} credits</div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}>${p.priceUsd} · ₦{p.priceNgn.toLocaleString()}</div>
              <Button onClick={() => purchase(p.code)} loading={busy === p.code} style={{ width: '100%' }}>Buy</Button>
            </div>
          ))}
        </div>
      </div>

      <div className="card" id="usage-history">
        <div className="card-title">Recent Ledger</div>
        {ledger.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No transactions</p> : (
          <table className="table">
            <thead><tr><th>Time</th><th>Event</th><th>Delta</th><th>Balance</th></tr></thead>
            <tbody>{ledger.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleString()}</td>
                <td>{e.event_type}</td>
                <td style={{ color: e.delta < 0 ? 'var(--danger)' : 'var(--success)' }}>{e.delta > 0 ? '+' : ''}{e.delta}</td>
                <td>{e.balance_after}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}