import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { useToast } from '../../toast-context';
import type { Wallet as WalletType, CreditPackage, LedgerEntry, PackageCode } from '../../../shared/types';

type PaymentRecord = Awaited<ReturnType<typeof api.listPayments>>[number];
interface ActivityItem {
  id: string;
  label: string;
  credits: number | null;
  amount: string | null;
  currency: string | null;
  reference: string | null;
  status: string;
  createdAt: string;
}

const EVENT_LABELS: Record<string, string> = {
  purchase: 'Credit purchase',
  promotional_grant: 'Promotional credits',
  adjustment: 'Wallet adjustment',
  reversal: 'Credit reversal',
  charge_open: 'Order opened',
  charge_close: 'Order closed',
  charge_ai: 'AI assessment',
  charge_service: 'Service usage',
  refund: 'Credit refund',
  expiry: 'Credits expired',
};

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiRequestError ? cause.message : fallback;
}

function formatCurrency(amount: string | null, currency: string | null): string {
  if (amount === null || currency === null) return '—';
  const value = Number(amount);
  if (!Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency}`;
  }
}

function paymentStatus(status: string): string {
  if (status === 'successful') return 'Completed';
  if (status === 'failed') return 'Failed';
  return 'Processing';
}

export function Wallet(): JSX.Element {
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<PackageCode | null>(null);
  const [verifyingReference, setVerifyingReference] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [packagesError, setPackagesError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const toast = useToast();
  const initialPaymentCheckStarted = useRef(false);

  const load = async () => {
    setLoading(true);
    setWalletError(null);
    setPackagesError(null);
    setActivityError(null);
    const [walletResult, packagesResult, ledgerResult, paymentsResult] = await Promise.allSettled([
      api.getWallet(), api.listPackages(), api.getLedger(100, 0), api.listPayments(),
    ]);
    if (walletResult.status === 'fulfilled') setWallet(walletResult.value);
    else setWalletError(errorMessage(walletResult.reason, 'Wallet details could not be loaded.'));
    if (packagesResult.status === 'fulfilled') setPackages(packagesResult.value);
    else setPackagesError(errorMessage(packagesResult.reason, 'Credit packages could not be loaded.'));
    if (ledgerResult.status === 'fulfilled') setLedger(ledgerResult.value);
    else setActivityError(errorMessage(ledgerResult.reason, 'Credit activity could not be loaded.'));
    const paymentRows = paymentsResult.status === 'fulfilled' ? paymentsResult.value : [];
    if (paymentsResult.status === 'fulfilled') setPayments(paymentRows);
    else setActivityError((previous) => previous ?? errorMessage(paymentsResult.reason, 'Payment history could not be loaded.'));
    setLoading(false);
    return paymentRows;
  };

  const checkPaymentStatus = async (reference: string, quietPending = false) => {
    setVerifyingReference(reference);
    try {
      const result = await api.verifyPayment(reference);
      if (result.status === 'successful') {
        toast.success(`${result.creditsGranted.toLocaleString()} credits added to your balance.`);
      } else if (result.status === 'failed' && !quietPending) {
        toast.error('Payment was not confirmed. No credits were added.');
      } else if (!quietPending) {
        toast.info('Payment is still processing. Check again shortly.');
      }
      await load();
    } catch (cause) {
      toast.error(errorMessage(cause, 'Payment could not be verified. Please try again.'));
    } finally {
      setVerifyingReference(null);
    }
  };

  useEffect(() => {
    if (initialPaymentCheckStarted.current) return;
    initialPaymentCheckStarted.current = true;
    const url = new URL(window.location.href);
    const reference = url.searchParams.get('ref');
    if (reference) {
      void load();
      void checkPaymentStatus(reference).then(() => {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get('ref') !== reference) return;
        currentUrl.searchParams.delete('ref');
        window.history.replaceState(window.history.state, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      });
      return;
    }

    void load().then(async (paymentRows) => {
      const recentPending = paymentRows.filter((payment) => (
        payment.status === 'pending'
        && Date.now() - Date.parse(payment.created_at) < 24 * 60 * 60 * 1000
      )).slice(0, 5);
      for (const payment of recentPending) {
        await checkPaymentStatus(payment.provider_reference, true);
      }
    });
  }, []);

  const paymentByReference = useMemo(() => new Map(payments.map((payment) => [payment.provider_reference, payment])), [payments]);
  const activity = useMemo(() => {
    const items: ActivityItem[] = ledger.map((entry) => {
      const reference = entry.reason.startsWith('paystack:') ? entry.reason.slice('paystack:'.length) : null;
      const payment = reference ? paymentByReference.get(reference) : undefined;
      return {
        id: entry.id,
        label: EVENT_LABELS[entry.event_type] ?? entry.event_type.replace(/_/g, ' '),
        credits: entry.delta,
        amount: payment?.amount ?? null,
        currency: payment?.currency ?? null,
        reference,
        status: 'Completed',
        createdAt: entry.created_at,
      };
    });
    const linkedReferences = new Set(ledger
      .filter((entry) => entry.reason.startsWith('paystack:'))
      .map((entry) => entry.reason.slice('paystack:'.length)));
    for (const payment of payments) {
      if (linkedReferences.has(payment.provider_reference)) continue;
      items.push({
        id: payment.id,
        label: 'Credit purchase',
        credits: null,
        amount: payment.amount,
        currency: payment.currency,
        reference: payment.provider_reference,
        status: paymentStatus(payment.status),
        createdAt: payment.created_at,
      });
    }
    return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 8);
  }, [ledger, paymentByReference, payments]);

  const usage = useMemo(() => {
    const categories = new Map<string, number>();
    for (const entry of ledger) {
      if (entry.delta >= 0) continue;
      const label = entry.event_type === 'charge_open' ? 'Order opens'
        : entry.event_type === 'charge_close' ? 'Order closes'
          : entry.event_type === 'charge_ai' ? 'AI assessments' : 'Other usage';
      categories.set(label, (categories.get(label) ?? 0) + Math.abs(entry.delta));
    }
    const values = [...categories.entries()].sort((a, b) => b[1] - a[1]);
    const maximum = Math.max(1, ...values.map(([, value]) => value));
    return values.map(([label, value]) => ({ label, value, percent: Math.round(value / maximum * 100) }));
  }, [ledger]);

  const purchase = async (code: PackageCode) => {
    setBusy(code);
    try {
      const result = await api.purchase(code);
      window.location.href = result.authorizationUrl;
    } catch (cause) {
      toast.error(errorMessage(cause, 'Purchase could not be started.'));
      setBusy(null);
    }
  };

  if (loading && !wallet) {
    return <div className="wallet-loading"><span className="dashboard-spinner" /> Loading your wallet…</div>;
  }
  if (!wallet) {
    return (
      <div className="wallet-page">
        <div className="wallet-error" role="alert"><strong>Wallet unavailable</strong><p>{walletError}</p><button type="button" onClick={() => void load()}>Try again</button></div>
      </div>
    );
  }

  return (
    <div className="wallet-page">
      <header className="wallet-heading">
        <div><span className="wallet-eyebrow">CREDIT MANAGEMENT</span><h1>Credit wallet</h1><p>Manage your VANTA credits and review account activity.</p></div>
        <a className="wallet-pricing-link" href="#wallet-packages"><Icon name="plus" size={16} /> Add credits</a>
      </header>

      <section className="wallet-balance-card">
        <div className="wallet-balance-main"><span><Icon name="credits" size={16} /> AVAILABLE BALANCE</span><strong>{wallet.available_credits.toLocaleString()}</strong><small>credits available to use</small></div>
        <div className="wallet-balance-divider" />
        <div className="wallet-balance-secondary"><span>Reserved</span><strong>{wallet.reserved_credits.toLocaleString()}</strong></div>
        <div className="wallet-balance-secondary"><span>Credits purchased</span><strong>{wallet.lifetime_purchased.toLocaleString()}</strong></div>
        <div className="wallet-balance-secondary"><span>Credits used</span><strong>{wallet.lifetime_used.toLocaleString()}</strong></div>
      </section>
      {walletError && <div className="wallet-inline-warning" role="alert">{walletError}</div>}

      <section className="wallet-section" id="wallet-packages">
        <div className="wallet-section-heading"><div><span className="wallet-eyebrow">TOP UP</span><h2>Choose a credit package</h2><p>One-time purchase. No subscription required.</p></div><span className="wallet-payment-note"><Icon name="shield" size={15} /> Secure checkout via Paystack</span></div>
        {packagesError && <div className="wallet-inline-warning" role="alert">{packagesError}</div>}
        {!packagesError && packages.length === 0 && <div className="wallet-empty">No credit packages are currently available.</div>}
        <div className="wallet-package-grid">
          {packages.map((item) => (
            <article key={item.code} className="wallet-package-card">
              <span className="wallet-package-name">{item.code}</span>
              <strong className="wallet-package-credits">{item.credits.toLocaleString()} <small>credits</small></strong>
              <div className="wallet-package-price"><strong>₦{item.priceNgn.toLocaleString()}</strong><span> / one-time</span></div>
              <div className="wallet-package-alt-price">Reference price: ${item.priceUsd.toLocaleString()} USD</div>
              <Button onClick={() => void purchase(item.code)} loading={busy === item.code} disabled={busy !== null && busy !== item.code} className="wallet-buy-button">
                {busy === item.code ? 'Opening checkout…' : 'Purchase credits'}
              </Button>
            </article>
          ))}
        </div>
        <p className="wallet-billing-footnote">Checkout is securely processed by Paystack. Credits are added after payment confirmation.</p>
      </section>

      <div className="wallet-lower-grid">
        <section className="wallet-section wallet-activity-section" id="usage-history">
          <div className="wallet-section-heading"><div><span className="wallet-eyebrow">ACCOUNT RECORD</span><h2>Recent activity</h2><p>Your credit ledger and payment status.</p></div><button type="button" className="wallet-refresh" onClick={() => void load()} disabled={loading}><Icon name="refresh" size={15} />Refresh</button></div>
          {activityError && <div className="wallet-inline-warning" role="alert">{activityError}</div>}
          {activity.length === 0 ? <div className="wallet-empty">No wallet activity yet. Purchased and used credits will appear here.</div> : (
            <div className="wallet-activity-list">
              {activity.map((item) => (
                <article className="wallet-activity-row" key={item.id}>
                  <span className={`wallet-activity-mark${item.status === 'Failed' ? ' is-failed' : ''}`}><Icon name={item.credits !== null && item.credits < 0 ? 'analytics' : 'credits'} size={17} /></span>
                  <div className="wallet-activity-description"><strong>{item.label}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></div>
                  <div className="wallet-activity-credits">{item.credits === null ? <small>Awaiting credit confirmation</small> : <strong className={item.credits < 0 ? 'is-negative' : 'is-positive'}>{item.credits > 0 ? '+' : ''}{item.credits} credits</strong>}</div>
                  <div className="wallet-activity-amount">
                    {formatCurrency(item.amount, item.currency)}
                    <small className={`wallet-activity-status status-${item.status.toLowerCase()}`}>{item.status}</small>
                    {item.status === 'Processing' && item.reference && (
                      <button
                        type="button"
                        className="wallet-verify-payment"
                        onClick={() => { if (item.reference) void checkPaymentStatus(item.reference); }}
                        disabled={verifyingReference !== null}
                      >
                        {verifyingReference === item.reference ? 'Checking…' : 'Check payment'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="wallet-section wallet-usage-section">
          <div className="wallet-section-heading"><div><span className="wallet-eyebrow">USAGE BREAKDOWN</span><h2>Credit usage</h2><p>Based on recorded wallet activity.</p></div></div>
          {usage.length === 0 ? <div className="wallet-empty">No credits have been used yet.</div> : (
            <div className="wallet-usage-list">{usage.map((item) => (
              <div className="wallet-usage-item" key={item.label}>
                <div><span>{item.label}</span><strong>{item.value.toLocaleString()} credits</strong></div>
                <div className="wallet-usage-track"><i style={{ width: `${item.percent}%` }} /></div>
              </div>
            ))}</div>
          )}
          <div className="wallet-rate-note"><Icon name="shield" size={16} /><span>Current rates: 2 credits per order open, order close, or AI assessment. Safety actions remain free.</span></div>
          <Link to="/pricing" className="wallet-learn-link">View credit pricing <Icon name="arrow-right" size={14} /></Link>
        </section>
      </div>
    </div>
  );
}
