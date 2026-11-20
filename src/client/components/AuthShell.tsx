import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

export function AuthShell({
  mode,
  children,
}: {
  mode: 'login' | 'signup';
  children: React.ReactNode;
}): JSX.Element {
  const isLogin = mode === 'login';
  return (
    <div className={`auth-page auth-page-${mode}`}>
      <aside className="auth-showcase">
        <Link to="/" className="auth-brand">
          <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 9 17 5l7 14L31 5l13 4-20 34z" fill="currentColor" /><path d="m17 5 7 14-7 13L4 9z" fill="currentColor" opacity=".58" /></svg>
          <span><strong>VANTA</strong><small>Trade AI</small></span>
        </Link>
        <div className="auth-art" aria-hidden="true">
          <div className="auth-art-halo" />
          <svg viewBox="0 0 520 285">
            <g className="auth-art-grid">{[30, 80, 130, 180, 230, 270].map((y) => <line key={`h${y}`} x1="0" x2="520" y1={y} y2={y} />)}{[40, 100, 160, 220, 280, 340, 400, 460].map((x) => <line key={`v${x}`} x1={x} x2={x} y1="0" y2="285" />)}</g>
            <path className="auth-art-fill" d="M0 220 C40 218 52 166 87 180 S137 220 166 151 211 135 241 164 280 187 310 112 358 98 389 116 425 66 454 80 488 36 520 32v253H0z" />
            <path className="auth-art-line" d="M0 220 C40 218 52 166 87 180 S137 220 166 151 211 135 241 164 280 187 310 112 358 98 389 116 425 66 454 80 488 36 520 32" />
            <path className="auth-art-secondary" d="M0 248 C68 236 77 218 134 214 S204 195 252 192 329 164 377 156 463 121 520 109" />
            {[68, 128, 188, 248, 308, 368, 428, 488].map((x, index) => (
              <g key={x} className={index === 2 || index === 6 ? 'auth-candle-down' : 'auth-candle-up'}>
                <line x1={x} x2={x} y1={54 + (index % 4) * 13} y2={194 - (index % 3) * 12} />
                <rect x={x - 6} y={91 + (index % 4) * 10} width="12" height={28 + (index % 3) * 9} rx="1" />
              </g>
            ))}
          </svg>
          <span className="auth-art-label">ILLUSTRATIVE MARKET VIEW · NOT LIVE DATA</span>
        </div>
        <div className="auth-showcase-copy">
          <span className="auth-eyebrow">TRADE WITH MORE CLARITY</span>
          <h1>{isLogin ? <>Welcome back.<br /><span>Your workspace awaits.</span></> : <>Build your strategy.<br /><span>Stay in control.</span></>}</h1>
          <p>{isLogin
            ? 'Sign in to review your bots, connected accounts, and trading activity.'
            : 'Create your account to connect a broker, configure risk limits, and manage your bots.'}</p>
        </div>
        <div className="auth-trust-list">
          <span><Icon name="shield" size={17} /> Broker credentials encrypted</span>
          <span><Icon name="performance" size={17} /> Independent risk checks</span>
          <span><Icon name="settings" size={17} /> You control your settings</span>
        </div>
        <div className="auth-showcase-footer">VANTA Trade AI <span>Trading involves risk. No profits are guaranteed.</span></div>
      </aside>

      <main className="auth-form-panel">
        <Link to="/" className="auth-brand auth-mobile-brand">
          <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 9 17 5l7 14L31 5l13 4-20 34z" fill="currentColor" /><path d="m17 5 7 14-7 13L4 9z" fill="currentColor" opacity=".58" /></svg>
          <span><strong>VANTA</strong><small>Trade AI</small></span>
        </Link>
        <div className="auth-form-heading">
          <span className="auth-form-icon"><Icon name={isLogin ? 'shield' : 'plus'} size={21} /></span>
          <span className="auth-eyebrow">{isLogin ? 'SECURE ACCOUNT ACCESS' : 'GET STARTED'}</span>
          <h2>{isLogin ? 'Sign in to VANTA' : 'Create your account'}</h2>
          <p>{isLogin ? 'Enter your credentials to continue.' : 'Join VANTA Trade AI and set up your workspace.'}</p>
        </div>
        <div className="auth-form-card">{children}</div>
        <p className="auth-form-legal">By continuing, you agree to use the platform in accordance with our <Link to="/terms">Terms</Link> and <Link to="/risk-disclosure">Risk Disclosure</Link>.</p>
      </main>
    </div>
  );
}
