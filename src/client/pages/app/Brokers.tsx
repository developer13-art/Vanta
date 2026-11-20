import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Icon } from '../../components/Icon';
import { useToast } from '../../toast-context';
import type { BrokerAccount } from '../../../shared/types';

type AccountMoneyField = 'account_balance' | 'account_equity';

function formatAmount(value: string | null, currency: string | null): string {
  const amount = Number(value);
  if (value === null || !Number.isFinite(amount)) return '—';
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency ?? ''}`.trim();
}

function totalForAccounts(accounts: BrokerAccount[], field: AccountMoneyField): { value: string; caption: string } {
  if (!accounts.length) return { value: '—', caption: 'No connected accounts' };
  const currencies = [...new Set(accounts.map((account) => account.account_currency).filter((value): value is string => !!value))];
  if (currencies.length > 1) return { value: 'Multiple', caption: currencies.join(' · ') };
  const currency = currencies[0];
  if (!currency) return { value: '—', caption: 'Currency unavailable' };
  if (accounts.some((account) => account.account_currency !== currency || account[field] === null)) {
    return { value: '—', caption: `Incomplete data · ${currency}` };
  }
  const amounts = accounts.map((account) => Number(account[field]));
  if (amounts.some((amount) => !Number.isFinite(amount))) {
    return { value: '—', caption: `Incomplete data · ${currency}` };
  }
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  return {
    value: total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    caption: currency,
  };
}

function statusLabel(status: BrokerAccount['status']): string {
  return status.replace(/_/g, ' ');
}

function statusClass(status: BrokerAccount['status']): string {
  if (status === 'connected') return 'broker-status-connected';
  if (status === 'requires_attention' || status === 'failed') return 'broker-status-attention';
  if (status === 'connecting' || status === 'provisioning' || status === 'deploying' || status === 'reconnecting') return 'broker-status-pending';
  return 'broker-status-offline';
}

export function Brokers(): JSX.Element {
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setError(null);
    api.listBrokers().then(setBrokers)
      .catch((cause: unknown) => setError(cause instanceof ApiRequestError ? cause.message : 'Broker accounts could not be loaded.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const connectedCount = brokers.filter((broker) => broker.status === 'connected').length;
  const liveCount = brokers.filter((broker) => broker.mode === 'live').length;
  const balance = useMemo(() => totalForAccounts(brokers, 'account_balance'), [brokers]);
  const equity = useMemo(() => totalForAccounts(brokers, 'account_equity'), [brokers]);
  const notConnectedCount = brokers.length - connectedCount;

  const refresh = async (id: string) => {
    setRefreshingId(id);
    try {
      await api.refreshHealth(id);
      toast.success('Account health refreshed');
    } catch (cause) {
      toast.error(cause instanceof ApiRequestError ? cause.message : 'Health refresh failed');
    } finally {
      try {
        setBrokers(await api.listBrokers());
      } catch (cause) {
        toast.error(cause instanceof ApiRequestError ? cause.message : 'Could not refresh account details');
      }
      setRefreshingId(null);
    }
  };

  return (
    <div className="brokers-page">
      <header className="brokers-heading">
        <div className="brokers-title-wrap">
          <span className="brokers-title-icon"><Icon name="broker" size={24} /></span>
          <div><span className="brokers-eyebrow">CONNECTED TRADING ACCOUNTS</span><h1>Broker Accounts</h1><p>Connect, review, and monitor the accounts you control.</p></div>
        </div>
        <Link to="/app/brokers/new" className="brokers-connect-button"><Icon name="plus" size={17} />Connect account</Link>
      </header>

      <section className="brokers-summary" aria-label="Broker account summary">
        <article className="brokers-stat brokers-stat-blue"><span className="brokers-stat-icon"><Icon name="broker" size={22} /></span><div><span>Total accounts</span><strong>{loading ? '—' : brokers.length}</strong><small>Connected and pending</small></div></article>
        <article className="brokers-stat brokers-stat-green"><span className="brokers-stat-icon"><Icon name="shield" size={22} /></span><div><span>Connected</span><strong>{loading ? '—' : connectedCount}</strong><small>{loading ? '—' : `${notConnectedCount} not connected`}</small></div></article>
        <article className="brokers-stat brokers-stat-purple"><span className="brokers-stat-icon"><Icon name="wallet" size={22} /></span><div><span>Total balance</span><strong>{loading ? '—' : balance.value}</strong><small>{loading ? '' : balance.caption}</small></div></article>
        <article className="brokers-stat brokers-stat-gold"><span className="brokers-stat-icon"><Icon name="performance" size={22} /></span><div><span>Total equity</span><strong>{loading ? '—' : equity.value}</strong><small>{loading ? '' : equity.caption}</small></div></article>
      </section>

      <div className="brokers-section-heading">
        <div><h2>Your accounts</h2><p>Current broker-reported details and connection status</p></div>
        {!loading && brokers.length > 0 && <span>{liveCount} live · {brokers.length - liveCount} demo</span>}
      </div>

      {error ? (
        <div className="brokers-empty" role="alert"><span className="brokers-empty-icon"><Icon name="broker" size={23} /></span><strong>Accounts unavailable</strong><p>{error}</p><button type="button" className="brokers-secondary-button" onClick={load}>Try again</button></div>
      ) : loading ? (
        <div className="brokers-empty"><span className="dashboard-spinner" /> Loading broker accounts…</div>
      ) : brokers.length === 0 ? (
        <div className="brokers-empty"><span className="brokers-empty-icon"><Icon name="broker" size={23} /></span><strong>No broker accounts yet</strong><p>Connect a demo account to discover instruments and configure your workspace.</p><Link to="/app/brokers/new" className="brokers-connect-button"><Icon name="plus" size={16} />Connect your first account</Link></div>
      ) : (
        <section className="brokers-account-grid">
          {brokers.map((broker) => (
            <article className="broker-account-card" key={broker.id}>
              <div className="broker-account-topline">
                <span className="broker-account-emblem"><Icon name="broker" size={24} /></span>
                <span className={`broker-status ${statusClass(broker.status)}`}><i />{statusLabel(broker.status)}</span>
                <span className={`broker-mode broker-mode-${broker.mode}`}>{broker.mode}</span>
              </div>
              <div className="broker-account-identity"><h3>{broker.label}</h3><p>{broker.broker_name} · {broker.server}</p><small>Login {broker.login}</small></div>
              <div className="broker-account-values">
                <div><span>Balance</span><strong>{formatAmount(broker.account_balance, broker.account_currency)}</strong></div>
                <div><span>Equity</span><strong>{formatAmount(broker.account_equity, broker.account_currency)}</strong></div>
                <div><span>Free margin</span><strong>{formatAmount(broker.account_free_margin, broker.account_currency)}</strong></div>
              </div>
              <div className={`broker-health-note${broker.last_error ? ' broker-health-error' : ''}`}>
                <span className={`broker-health-dot${broker.last_health_status === 'ok' ? ' is-ok' : ''}`} />
                <span>{broker.last_health_check_at
                  ? `Last health check ${new Date(broker.last_health_check_at).toLocaleString()}`
                  : 'Health check not yet recorded'}</span>
              </div>
              {broker.last_error && <p className="broker-account-error">{broker.last_error}</p>}
              <div className="broker-account-actions">
                <Link to={`/app/brokers/${broker.id}`} className="brokers-secondary-button">Manage account <Icon name="arrow-right" size={14} /></Link>
                <button type="button" className="broker-refresh-button" onClick={() => refresh(broker.id)} disabled={refreshingId !== null}>
                  <Icon name="refresh" size={14} className={refreshingId === broker.id ? 'positions-spinning' : undefined} />{refreshingId === broker.id ? 'Checking…' : 'Refresh'}
                </button>
              </div>
            </article>
          ))}
          <Link to="/app/brokers/new" className="brokers-add-card">
            <span><Icon name="plus" size={24} /></span><strong>Connect another account</strong><p>Add another broker connection you control.</p><em>Connect account <Icon name="arrow-right" size={14} /></em>
          </Link>
        </section>
      )}
      {!loading && !error && brokers.length > 0 && (
        <div className="brokers-footnote"><Icon name="shield" size={15} /><span>Balance and equity are broker-reported snapshots. Accounts using different currencies are not combined.</span></div>
      )}
    </div>
  );
}
