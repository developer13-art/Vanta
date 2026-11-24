import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { useToast } from '../../toast-context';
import type { Wallet as WalletType, CreditPackage, LedgerEntry, PackageCode } from '../../../shared/types';

type PaymentRecord = Awaited<ReturnType<typeof api.listPayments>>[number];
type PaymentOptions = Awaited<ReturnType<typeof api.paymentOptions>>;
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
  const [paymentOptions, setPaymentOptions] = useState<PaymentOptions | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState('NGN');
  const [selectedProvider, setSelectedProvider] = useState<'paystack' | 'flutterwave' | 'stripe'>('paystack');
  const [selectedMethod, setSelectedMethod] = useState<'card' | 'bank_transfer'>('card');
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<PackageCode | null>(null);
  const [verifyingReference, setVerifyingReference] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [packagesError, setPackagesError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [paymentOptionsError, setPaymentOptionsError] = useState<string | null>(null);
  const toast = useToast();
  const initialPaymentCheckStarted = useRef(false);

  const load = async () => {
    setLoading(true);
    setWalletError(null);
    setActivityError(null);
    const [walletResult, ledgerResult, paymentsResult] = await Promise.allSettled([
      api.getWallet(), api.getLedger(100, 0), api.listPayments(),
    ]);
    if (walletResult.status === 'fulfilled') setWallet(walletResult.value);
    else setWalletError(errorMessage(walletResult.reason, 'Wallet details could not be loaded.'));
    if (ledgerResult.status === 'fulfilled') setLedger(ledgerResult.value);
    else setActivityError(errorMessage(ledgerResult.reason, 'Credit activity could not be loaded.'));
    const paymentRows = paymentsResult.status === 'fulfilled' ? paymentsResult.value : [];
    if (paymentsResult.status === 'fulfilled') setPayments(paymentRows);
    else setActivityError((previous) => previous ?? errorMessage(paymentsResult.reason, 'Payment history could not be loaded.'));
    setLoading(false);
    return paymentRows;
  };

  const checkPaymentStatus = async (
    reference: string,
    quietPending = false,
    transactionId?: string,
  ) => {
    setVerifyingReference(reference);
    try {
      const result = await api.verifyPayment(reference, transactionId);
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
    const reference = url.searchParams.get('ref') ?? url.searchParams.get('tx_ref');
    const transactionId = url.searchParams.get('transaction_id') ?? undefined;
    const initialize = async () => {
      try {
        const options = await api.paymentOptions();
        setPaymentOptions(options);
        const initialCurrency = options.currencies.some(({ code }) => code === 'NGN')
          ? 'NGN'
          : options.currencies[0]?.code ?? 'NGN';
        setSelectedCurrency(initialCurrency);
        const initialMethod = options.currencies.find(({ code }) => code === initialCurrency)?.methods[0];
        if (initialMethod) {
          setSelectedProvider(initialMethod.provider);
          setSelectedMethod(initialMethod.method);
        }

        const paymentRows = await load();
        if (reference) {
          await checkPaymentStatus(reference, false, transactionId);
          const currentUrl = new URL(window.location.href);
          for (const parameter of ['ref', 'tx_ref', 'transaction_id', 'status', 'checkout']) {
            currentUrl.searchParams.delete(parameter);
          }
          window.history.replaceState(window.history.state, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
          return;
        }

        const recentPending = paymentRows.filter((payment) => (
          payment.status === 'pending'
          && Date.now() - Date.parse(payment.created_at) < 24 * 60 * 60 * 1000
        )).slice(0, 5);
        for (const payment of recentPending) {
          await checkPaymentStatus(payment.provider_reference, true, payment.provider_transaction_id ?? undefined);
        }
      } catch (cause) {
        setPaymentOptionsError(errorMessage(cause, 'Payment methods could not be loaded.'));
        await load();
      }
    };
    void initialize();
  }, []);

  useEffect(() => {
    let active = true;
    setPackagesError(null);
    api.listPackages(selectedCurrency).then((result) => {
      if (active) setPackages(result);
    }).catch((cause: unknown) => {
      if (active) setPackagesError(errorMessage(cause, 'Credit package prices could not be loaded.'));
    });
    return () => { active = false; };
  }, [selectedCurrency]);

  const currentCurrencyOptions = paymentOptions?.currencies.find(({ code }) => code === selectedCurrency);
  const currentMethods = currentCurrencyOptions?.methods ?? [];
  const selectedPaymentOption = currentMethods.find((option) => (
    option.provider === selectedProvider && option.method === selectedMethod
  ));

  useEffect(() => {
    if (selectedPaymentOption || currentMethods.length === 0) return;
    const firstMethod = currentMethods[0];
    if (!firstMethod) return;
    setSelectedProvider(firstMethod.provider);
    setSelectedMethod(firstMethod.method);
  }, [selectedCurrency, currentMethods, selectedPaymentOption]);

  const paymentByReference = useMemo(() => new Map(payments.map((payment) => [payment.provider_reference, payment])), [payments]);
  const activity = useMemo(() => {
    const items: ActivityItem[] = ledger.map((entry) => {
      const reasonSeparator = entry.reason.indexOf(':');
      const reference = entry.event_type === 'purchase' && reasonSeparator !== -1
        ? entry.reason.slice(reasonSeparator + 1)
        : null;
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
      .filter((entry) => entry.event_type === 'purchase' && entry.reason.includes(':'))
      .map((entry) => entry.reason.slice(entry.reason.indexOf(':') + 1)));
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
      const result = await api.purchase(code, selectedProvider, selectedMethod, selectedCurrency);
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
        <div className="wallet-section-heading">
          <div><span className="wallet-eyebrow">TOP UP</span><h2>Choose a credit package</h2><p>One-time purchase. No subscription required.</p></div>
          <span className="wallet-payment-note"><Icon name="shield" size={15} />{selectedPaymentOption ? `Secure checkout via ${selectedPaymentOption.label}` : 'Choose a payment method'}</span>
        </div>
        {paymentOptionsError && <div className="wallet-inline-warning" role="alert">{paymentOptionsError}</div>}
        <div className="wallet-checkout-options">
          <label className="wallet-currency-picker">
            <span>Payment currency</span>
            <select
              value={selectedCurrency}
              onChange={(event) => setSelectedCurrency(event.target.value)}
              disabled={!paymentOptions || paymentOptions.currencies.length === 0}
            >
              {(paymentOptions?.currencies ?? []).map(({ code }) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
          <fieldset className="wallet-payment-method-picker" disabled={!currentMethods.length}>
            <legend>Payment method</legend>
            {currentMethods.map((option) => (
              <label className={`wallet-payment-method${selectedPaymentOption === option ? ' is-selected' : ''}`} key={`${option.provider}-${option.method}`}>
                <input
                  type="radio"
                  name="wallet-payment-method"
                  checked={option.provider === selectedProvider && option.method === selectedMethod}
                  onChange={() => {
                    setSelectedProvider(option.provider);
                    setSelectedMethod(option.method);
                  }}
                />
                <span>{option.label}</span>
                {option.method === 'bank_transfer' && <small>Automated confirmation</small>}
              </label>
            ))}
            {!paymentOptionsError && currentMethods.length === 0 && <p>No payment methods are configured for this currency.</p>}
          </fieldset>
        </div>
        {packagesError && <div className="wallet-inline-warning" role="alert">{packagesError}</div>}
        {!packagesError && packages.length === 0 && <div className="wallet-empty">No credit packages are currently available.</div>}
        <div className="wallet-package-grid">
          {packages.map((item) => (
            <article key={item.code} className="wallet-package-card">
              <span className="wallet-package-name">{item.code}</span>
              <strong className="wallet-package-credits">{item.credits.toLocaleString()} <small>credits</small></strong>
              <div className="wallet-package-price"><strong>{formatCurrency(String(item.amount), item.currency)}</strong><span> / one-time</span></div>
              <div className="wallet-package-alt-price">Converted from ${item.priceUsd.toLocaleString()} USD</div>
              <Button onClick={() => void purchase(item.code)} loading={busy === item.code} disabled={!selectedPaymentOption || busy !== null && busy !== item.code} className="wallet-buy-button">
                {busy === item.code ? 'Opening checkout…' : 'Purchase credits'}
              </Button>
            </article>
          ))}
        </div>
        <p className="wallet-billing-footnote">
          Prices are converted from USD using the latest available exchange rate{packages[0]?.ratesUpdatedAt
            ? ` (updated ${new Date(packages[0].ratesUpdatedAt).toLocaleString()})`
            : paymentOptions?.ratesUpdatedAt ? ` (updated ${new Date(paymentOptions.ratesUpdatedAt).toLocaleString()})` : ''}.
          {' '}Credits are added only after the selected provider confirms payment.
        </p>
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
                        onClick={() => {
                          if (item.reference) {
                            void checkPaymentStatus(item.reference, false, paymentByReference.get(item.reference)?.provider_transaction_id ?? undefined);
                          }
                        }}
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
