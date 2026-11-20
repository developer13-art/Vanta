import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Input } from '../../components/Input';
import { useToast } from '../../toast-context';

type Platform = 'mt4' | 'mt5';
type Mode = 'demo' | 'live';

export function BrokerAdd(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({
    label: '', brokerName: '', server: '', login: '', password: '',
    mode: 'demo' as Mode, platform: 'mt5' as Platform,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: typeof form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.createBroker(form);
      toast.success('Account provisioning started');
      navigate(`/app/brokers/${result.id}`);
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="broker-connect-page">
      <header className="broker-connect-heading">
        <Link to="/app/brokers" className="broker-connect-back"><Icon name="arrow-right" size={15} /> Broker accounts</Link>
        <span className="broker-connect-eyebrow">ACCOUNT SETUP</span>
        <h1>Connect your broker</h1>
        <p>Securely link an MT4 or MT5 account to VANTA. Start with demo mode while you get familiar with the platform.</p>
      </header>

      <div className="broker-connect-layout">
        <form className="broker-connect-form" onSubmit={onSubmit}>
          <section className="broker-connect-section">
            <div className="broker-connect-section-title"><span>01</span><div><h2>Platform and account</h2><p>Select the platform and account type from your broker.</p></div></div>
            <div className="broker-platform-options" aria-label="Trading platform">
              {(['mt4', 'mt5'] as const).map((platform) => (
                <button
                  type="button"
                  key={platform}
                  className={`broker-platform-option${form.platform === platform ? ' is-selected' : ''}`}
                  aria-pressed={form.platform === platform}
                  onClick={() => set('platform', platform)}
                >
                  <span className="broker-platform-mark">{platform.toUpperCase()}</span>
                  <span><strong>MetaTrader {platform === 'mt4' ? '4' : '5'}</strong><small>{platform === 'mt4' ? 'MT4 account' : 'MT5 account'}</small></span>
                  <i aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className="broker-mode-options" role="group" aria-label="Account mode">
              <button type="button" className={form.mode === 'demo' ? 'is-selected' : ''} aria-pressed={form.mode === 'demo'} onClick={() => set('mode', 'demo')}>
                <strong>Demo</strong><small>Recommended to start</small>
              </button>
              <button type="button" className={form.mode === 'live' ? 'is-selected' : ''} aria-pressed={form.mode === 'live'} onClick={() => set('mode', 'live')}>
                <strong>Live</strong><small>Real funds are at risk</small>
              </button>
            </div>
          </section>

          <section className="broker-connect-section">
            <div className="broker-connect-section-title"><span>02</span><div><h2>Broker details</h2><p>Enter the connection details shown in your trading account.</p></div></div>
            <Input label="Account label" required value={form.label} onChange={(event) => set('label', event.target.value)} placeholder="My demo account" />
            <Input label="Broker name" required value={form.brokerName} onChange={(event) => set('brokerName', event.target.value)} placeholder="Example: IC Markets" />
            <Input label="Broker server" required value={form.server} onChange={(event) => set('server', event.target.value)} placeholder={form.platform === 'mt4' ? 'ExampleBroker-Demo' : 'ExampleBroker-MT5'} />
            <div className="broker-connect-fields">
              <Input label="Account login" required value={form.login} onChange={(event) => set('login', event.target.value)} placeholder="Trading account number" />
              <Input label="Trading password" type="password" required value={form.password} onChange={(event) => set('password', event.target.value)} placeholder="Trading password" autoComplete="new-password" />
            </div>
            <p className="broker-connect-hint">Use your trading password—not your broker website password. Find the exact server name in your broker’s account details.</p>
          </section>

          <div className="broker-connect-security"><Icon name="shield" size={19} /><p><strong>Your credentials are protected.</strong> VANTA encrypts the submitted password at rest and does not display it again after submission.</p></div>
          {error && <div className="broker-connect-error" role="alert">{error}</div>}
          <div className="broker-connect-submit">
            <Button type="submit" loading={loading}>Connect account <Icon name="arrow-right" size={16} /></Button>
            <Link to="/app/brokers">Cancel</Link>
          </div>
          <p className="broker-connect-disclaimer">Connecting an account does not start a trading bot. Review and authorize each strategy separately.</p>
        </form>

        <aside className="broker-connect-aside">
          <div className="broker-connect-aside-card">
            <span className="broker-connect-aside-icon"><Icon name="broker" size={20} /></span>
            <h2>Before you connect</h2>
            <ul>
              <li><span>1</span>Have your MT4/MT5 login and exact server name ready.</li>
              <li><span>2</span>Start with a demo account to verify the connection.</li>
              <li><span>3</span>Check the account status after provisioning completes.</li>
            </ul>
          </div>
          <div className="broker-connect-help"><Icon name="shield" size={18} /><div><strong>Need help finding your server?</strong><p>See common setup questions or contact the VANTA support team.</p><Link to="/faq">Visit help center <Icon name="arrow-right" size={13} /></Link></div></div>
        </aside>
      </div>
    </div>
  );
}
