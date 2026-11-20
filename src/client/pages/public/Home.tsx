import React from 'react';
import { Link } from 'react-router-dom';
import { Icon, IconName } from '../../components/Icon';

const features: Array<{ icon: IconName; title: string; description: string }> = [
  { icon: 'bot', title: 'Automated trading bots', description: 'Configure and manage strategies for your connected MT4 or MT5 account.' },
  { icon: 'markets', title: 'Broker-discovered markets', description: 'Choose instruments available from your own connected broker account.' },
  { icon: 'shield', title: 'Independent risk controls', description: 'Set loss, drawdown, margin, and spread limits for each bot.' },
  { icon: 'performance', title: 'Trade performance', description: 'Review realized results, open positions, and bot activity in one workspace.' },
  { icon: 'credits', title: 'Transparent credit wallet', description: 'View your credit balance and transaction ledger. No mandatory subscription.' },
  { icon: 'broker', title: 'Your broker account', description: 'Connect an account you control. VANTA never requests withdrawal permission.' },
];

export function Home(): JSX.Element {
  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <div className="home-eyebrow"><span /> BROKER-CONNECTED TRADING WORKSPACE</div>
          <h1>Trade smarter.<br /><span>Stay in control.</span></h1>
          <p>Connect your own MetaTrader account, configure a strategy, and manage automated trading with risk controls you define.</p>
          <div className="home-hero-actions">
            <Link to="/signup" className="home-primary-button">Start Trading Now <Icon name="arrow-right" size={16} /></Link>
            <Link to="/how-it-works" className="home-secondary-button"><span className="home-play-icon">▶</span> How it works</Link>
          </div>
          <div className="home-trust-row">
            <span><Icon name="shield" size={17} /> Your broker account</span>
            <span><Icon name="performance" size={17} /> Risk-first controls</span>
            <span><Icon name="markets" size={17} /> Multi-market access</span>
          </div>
        </div>

        <div className="home-hero-art" aria-label="Illustrative VANTA trading dashboard preview">
          <div className="home-art-glow" />
          <div className="home-world-grid" />
          <div className="home-orbit home-orbit-one" />
          <div className="home-orbit home-orbit-two" />
          <div className="home-device home-laptop">
            <div className="home-device-top"><span className="home-device-logo">VANTA <small>TRADE AI</small></span><span className="home-device-chip">DEMO VIEW</span></div>
            <div className="home-device-body">
              <div className="home-device-side"><i /><i /><i /><i /><i /></div>
              <div className="home-device-content">
                <div className="home-device-metrics"><span><small>OPEN POSITIONS</small><b>--</b></span><span><small>ACTIVE BOTS</small><b>--</b></span><span><small>RISK CONTROLS</small><b>On</b></span></div>
                <svg className="home-device-chart" viewBox="0 0 490 170" role="img" aria-label="Illustrative chart, not live market data">
                  <g>{[20, 58, 96, 134].map((y) => <line key={y} x1="0" x2="490" y1={y} y2={y} />)}</g>
                  <path d="M4 132 C35 128 45 97 71 106 S110 119 133 81 168 85 191 70 229 99 252 63 282 54 310 66 347 42 367 56 407 28 428 43 460 19 486 25" />
                  <path className="home-chart-secondary" d="M4 143 C40 139 54 130 82 128 S125 112 151 110 192 99 222 96 272 84 298 82 344 71 369 67 425 50 486 46" />
                  {[48, 101, 154, 207, 260, 313, 366, 419, 468].map((x, index) => (
                    <g key={x} className={index % 3 === 1 ? 'home-candle-down' : 'home-candle-up'}>
                      <line x1={x} x2={x} y1={45 + (index % 4) * 10} y2={112 + (index % 3) * 9} />
                      <rect x={x - 5} y={65 + (index % 4) * 8} width="10" height={20 + (index % 3) * 7} rx="1" />
                    </g>
                  ))}
                </svg>
                <div className="home-device-footer"><span>Illustrative preview · not live market data</span><span>Risk limits configured</span></div>
              </div>
            </div>
          </div>
          <div className="home-device home-phone">
            <div className="home-phone-notch" />
            <span className="home-device-logo">VANTA</span>
            <div className="home-phone-heading">Portfolio</div>
            <div className="home-phone-stat"><small>ACCOUNT EQUITY</small><b>Broker data</b></div>
            <svg viewBox="0 0 100 48" aria-hidden="true"><path d="M2 39 15 32 25 36 38 20 48 26 60 14 71 20 82 8 98 4" /></svg>
            <div className="home-phone-row"><i /> Bots <span>Manage</span></div>
            <div className="home-phone-row"><i /> Positions <span>Review</span></div>
          </div>
          <div className="home-art-caption"><span /> Platform preview · values are illustrative</div>
        </div>
      </section>

      <section className="home-features">
        <div className="home-section-heading">
          <span className="home-section-eyebrow">TOOLS FOR YOUR WORKFLOW</span>
          <h2>Everything you need to trade with intention</h2>
          <p>Configure, monitor, and manage your own connected trading accounts.</p>
        </div>
        <div className="home-feature-grid">
          {features.map((feature) => (
            <article className="home-feature-card" key={feature.title}>
              <span className="home-feature-icon"><Icon name={feature.icon} size={22} /></span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-process">
        <div className="home-process-copy">
          <span className="home-section-eyebrow">GET STARTED</span>
          <h2>Your account. Your settings. Your decision.</h2>
          <p>Start with a demo account, learn the controls, and only enable live trading when you are ready.</p>
          <Link to="/how-it-works" className="home-text-link">See how it works <Icon name="arrow-right" size={15} /></Link>
        </div>
        <div className="home-process-steps">
          <article><span>01</span><div><h3>Connect</h3><p>Link your MetaTrader 4 or 5 broker account through MetaApi.</p></div></article>
          <article><span>02</span><div><h3>Configure</h3><p>Choose your instruments and set strategy and risk parameters.</p></div></article>
          <article><span>03</span><div><h3>Review & manage</h3><p>Create your bot in Ready state, then start or pause it from your dashboard.</p></div></article>
        </div>
      </section>

      <section className="home-risk-banner">
        <span className="home-risk-icon"><Icon name="shield" size={24} /></span>
        <div><h2>Risk first, always.</h2><p>Trading involves substantial risk. Automated strategies can lose money; risk limits do not guarantee against losses.</p></div>
        <Link to="/risk-disclosure">Read the risk disclosure <Icon name="arrow-right" size={14} /></Link>
      </section>
    </div>
  );
}
