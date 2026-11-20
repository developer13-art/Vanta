import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Icon } from '../../components/Icon';
import type { CreditPackage } from '../../../shared/types';

interface CreditRates {
  openOrder: number;
  closeOrder: number;
  aiAssessment: number;
}

export function Pricing(): JSX.Element {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [rates, setRates] = useState<CreditRates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([api.listPackages(), api.publicRates()]).then(([packageResult, ratesResult]) => {
      if (packageResult.status === 'fulfilled') setPackages(packageResult.value);
      else setError(packageResult.reason instanceof ApiRequestError ? packageResult.reason.message : 'Credit packages could not be loaded.');
      if (ratesResult.status === 'fulfilled') setRates(ratesResult.value);
      else setError((current) => current ?? (ratesResult.reason instanceof ApiRequestError ? ratesResult.reason.message : 'Credit rates could not be loaded.'));
      setLoading(false);
    });
  }, []);

  const examples = rates ? [
    { activity: '5 round trips, 1 assessment', opens: 5, assessments: 1 },
    { activity: '10 round trips, 1 assessment', opens: 10, assessments: 1 },
    { activity: '50 round trips, 10 assessments', opens: 50, assessments: 10 },
  ] : [];

  return (
    <div className="public-section pricing-page">
      <header className="public-page-heading">
        <span className="public-page-eyebrow">STRAIGHTFORWARD BILLING</span>
        <h1>Credits that keep you in control</h1>
        <p>Choose a one-time credit package. Review the current per-action rates before you start.</p>
      </header>

      <section className="pricing-rate-strip" aria-label="Credit rates">
        {rates ? <>
          <div><span>Order open</span><strong>{rates.openOrder} <small>credits</small></strong></div>
          <div><span>Order close</span><strong>{rates.closeOrder} <small>credits</small></strong></div>
          <div><span>AI assessment</span><strong>{rates.aiAssessment} <small>credits</small></strong></div>
          <p>Charged only for confirmed billable actions. Emergency safety actions remain free.</p>
        </> : error ? <p className="pricing-error" role="alert">{error}</p> : <p>Loading current credit rates…</p>}
      </section>

      <section className="pricing-packages-section">
        <div className="public-section-title"><div><span className="public-page-eyebrow">PREPAID, NO SUBSCRIPTION</span><h2>Choose your package</h2></div><span><Icon name="shield" size={15} /> Credits do not expire under current policy</span></div>
        {error && <div className="pricing-error" role="alert">{error}</div>}
        {loading && <div className="pricing-empty">Loading available packages…</div>}
        {!loading && !error && packages.length === 0 && <div className="pricing-empty">No credit packages are currently available.</div>}
        <div className="pricing-package-grid">
          {packages.map((item) => (
            <article key={item.code} className="pricing-package-card">
              <span className="pricing-package-name">{item.code}</span>
              <strong className="pricing-package-credits">{item.credits.toLocaleString()} <small>credits</small></strong>
              <div className="pricing-package-price">₦{item.priceNgn.toLocaleString()} <small>one-time</small></div>
              <span className="pricing-package-reference">Reference price: ${item.priceUsd.toLocaleString()} USD</span>
              <Link to="/signup" className="pricing-package-button">Get started <Icon name="arrow-right" size={15} /></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="pricing-examples">
        <div className="public-section-title"><div><span className="public-page-eyebrow">ILLUSTRATIVE EXAMPLES</span><h2>Estimate credit usage</h2></div></div>
        <p>Examples use the current rates shown above. Actual usage depends on confirmed actions and assessments.</p>
        {rates && <div className="pricing-examples-grid">
          {examples.map((example) => {
            const execution = example.opens * (rates.openOrder + rates.closeOrder);
            const ai = example.assessments * rates.aiAssessment;
            return <article key={example.activity}><span>{example.activity}</span><strong>{(execution + ai).toLocaleString()} <small>credits</small></strong><small>{execution} execution + {ai} assessment</small></article>;
          })}
        </div>}
      </section>
      <div className="pricing-support-note"><Icon name="shield" size={17} /><span>Trading has financial risk. Credits are platform usage units, not a measure of trading results. <Link to="/risk-disclosure">Read the risk disclosure</Link>.</span></div>
    </div>
  );
}
