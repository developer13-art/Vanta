import React from 'react';
import { Link, Outlet } from 'react-router-dom';

export function PublicLayout(): JSX.Element {
  return (
    <div className="public-site">
      <nav className="public-nav">
        <Link to="/" className="public-brand">
          <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 9 17 5l7 14L31 5l13 4-20 34z" fill="currentColor" /><path d="m17 5 7 14-7 13L4 9z" fill="currentColor" opacity=".58" /></svg>
          <span><strong>VANTA</strong><small>Trade AI</small></span>
        </Link>
        <div className="public-nav-links">
          <Link to="/">Home</Link>
          <Link to="/features">Features</Link>
          <Link to="/how-it-works">How It Works</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/contact">Support</Link>
          <Link to="/login" className="public-login-link">Sign In</Link>
          <Link to="/signup" className="public-cta-link">Get Started <span>→</span></Link>
        </div>
      </nav>
      <main className="public-main"><Outlet /></main>
      <footer className="footer">
        <Link to="/" className="public-footer-brand">VANTA <span>Trade AI</span></Link>
        <div className="public-footer-links">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/risk-disclosure">Risk Disclosure</Link>
          <Link to="/credit-refund-policy">Credit Policy</Link>
        </div>
        <div className="public-footer-disclaimer">VANTA Trade AI — Trading involves substantial risk. No profits are guaranteed.</div>
      </footer>
    </div>
  );
}