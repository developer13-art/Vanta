import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';

const STEPS = [
  ['Create your VANTA account', 'Sign up and complete the account verification steps.'],
  ['Connect a trading account', 'Link an MT4 or MT5 account. A demo account is recommended for your first connection.'],
  ['Review available instruments', 'VANTA reads instrument availability from the connected broker account.'],
  ['Configure a supported strategy', 'Set up an EMA crossover bot and review its parameters and risk settings.'],
  ['Check the configuration', 'Review the account, mode, strategy values, and risk controls before creating the bot.'],
  ['Choose when to start', 'A newly created bot is ready, not running. Start it only after you have reviewed the setup.'],
  ['Monitor and manage', 'Follow account health, positions, history, and wallet activity from the workspace.'],
];

export function HowItWorks(): JSX.Element {
  return (
    <div className="public-section how-it-works-page">
      <header className="public-page-heading">
        <span className="public-page-eyebrow">A CONTROLLED SETUP</span>
        <h1>From broker connection to monitoring</h1>
        <p>Set up in deliberate steps. Connecting an account does not automatically start a trading bot.</p>
      </header>

      <section className="how-it-works-layout">
        <div className="how-it-works-steps">
          {STEPS.map(([title, description], index) => (
            <article className="how-step" key={title}>
              <span className="how-step-number">{String(index + 1).padStart(2, '0')}</span>
              <div><h2>{title}</h2><p>{description}</p></div>
            </article>
          ))}
        </div>
        <aside className="how-it-works-note">
          <span><Icon name="shield" size={20} /></span>
          <span className="public-page-eyebrow">LIVE TRADING</span>
          <h2>Demo first. Live only by choice.</h2>
          <p>Live trading involves real financial risk. Review the selected account and bot configuration before enabling any live activity.</p>
          <Link to="/risk-disclosure">Read the risk disclosure <Icon name="arrow-right" size={14} /></Link>
        </aside>
      </section>
      <div className="how-it-works-cta"><p>Ready to explore the workspace?</p><Link to="/signup" className="public-primary-link">Create an account <Icon name="arrow-right" size={15} /></Link></div>
    </div>
  );
}
