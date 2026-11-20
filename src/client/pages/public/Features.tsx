import React from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../../components/Icon';

const FEATURES: Array<{ icon: IconName; title: string; description: string; label: string }> = [
  { icon: 'broker', title: 'Broker-connected trading', description: 'Connect an MT4 or MT5 account and work with the instruments available through your broker.', label: 'YOUR ACCOUNT' },
  { icon: 'bot', title: 'Configurable strategy bots', description: 'Set up supported EMA crossover bots with editable parameters and reviewable settings.', label: 'STRATEGY TOOLS' },
  { icon: 'shield', title: 'Independent risk checks', description: 'Trade proposals pass through risk controls before submission. Your configured limits stay in force.', label: 'RISK CONTROLS' },
  { icon: 'analytics', title: 'Clear account activity', description: 'Review broker-reported positions, order history, wallet activity, and platform events in one workspace.', label: 'VISIBILITY' },
  { icon: 'credits', title: 'Prepaid credit wallet', description: 'Use published per-action rates and track confirmed credit changes in the wallet ledger.', label: 'BILLING' },
  { icon: 'refresh', title: 'Connection health', description: 'See account connection status and request a health refresh when you need an updated check.', label: 'OPERATIONS' },
];

export function Features(): JSX.Element {
  return (
    <div className="public-section features-page">
      <header className="public-page-heading">
        <span className="public-page-eyebrow">TOOLS FOR YOUR WORKFLOW</span>
        <h1>Trading tools, with your account in view</h1>
        <p>VANTA brings broker connections, strategy setup, risk checks, and wallet activity into a single workspace.</p>
        <Link to="/signup" className="public-primary-link">Explore VANTA <Icon name="arrow-right" size={15} /></Link>
      </header>

      <section className="feature-grid" aria-label="VANTA features">
        {FEATURES.map((feature, index) => (
          <article className="feature-card" key={feature.title}>
            <div className="feature-card-top"><span className="feature-icon"><Icon name={feature.icon} size={20} /></span><span>{String(index + 1).padStart(2, '0')}</span></div>
            <span className="feature-card-label">{feature.label}</span>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </article>
        ))}
      </section>

      <aside className="feature-disclaimer"><Icon name="shield" size={17} /><p>Automated tools do not remove market risk. Review settings before authorizing a strategy; trading results are not guaranteed.</p></aside>
    </div>
  );
}
