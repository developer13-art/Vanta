import React, { useEffect, useState } from 'react';
import { api, ApiRequestError } from '../api';
import { Button } from './Button';
import { useToast } from '../toast-context';
import type { CreditPackage, PackageCode } from '../../shared/types';

interface Props {
  onPurchased?: (reference: string) => void;
}

export function CreditPackages({ onPurchased }: Props): JSX.Element {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [busy, setBusy] = useState<PackageCode | null>(null);
  const toast = useToast();

  useEffect(() => {
    api.listPackages('NGN').then(setPackages).catch(() => setPackages([]));
  }, []);

  const purchase = async (code: PackageCode) => {
    setBusy(code);
    try {
      const r = await api.purchase(code, 'paystack', 'card', 'NGN');
      onPurchased?.(r.reference);
      window.location.href = r.authorizationUrl;
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Purchase failed');
      setBusy(null);
    }
  };

  if (packages.length === 0) return <div style={{ color: 'var(--text-muted)' }}>Loading packages…</div>;

  return (
    <div className="grid-3">
      {packages.map((p) => (
        <div key={p.code} className="card">
          <div style={{ textTransform: 'capitalize', fontWeight: 600, marginBottom: 8 }}>{p.code}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{p.credits.toLocaleString()} credits</div>
          <div style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
            {new Intl.NumberFormat(undefined, { style: 'currency', currency: p.currency }).format(p.amount)} · USD base ${p.priceUsd}
          </div>
          <Button onClick={() => purchase(p.code)} loading={busy === p.code} style={{ width: '100%' }}>Buy</Button>
        </div>
      ))}
    </div>
  );
}