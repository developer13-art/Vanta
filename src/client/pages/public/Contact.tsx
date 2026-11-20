import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';

export function Contact(): JSX.Element {
  return (
    <div className="public-section contact-page">
      <header className="public-page-heading">
        <span className="public-page-eyebrow">VANTA SUPPORT</span>
        <h1>How can we help?</h1>
        <p>Browse common questions or reach the right team by email.</p>
      </header>

      <section className="contact-card-grid">
        <Link to="/faq" className="contact-card">
          <span className="contact-card-icon"><Icon name="analytics" size={20} /></span>
          <span className="public-page-eyebrow">SELF-SERVICE</span>
          <h2>Frequently asked questions</h2>
          <p>Find guidance on broker connections, credits, and account safety.</p>
          <strong>Browse help <Icon name="arrow-right" size={14} /></strong>
        </Link>
        <a href="mailto:support@vantatrade.ai" className="contact-card">
          <span className="contact-card-icon"><Icon name="notifications" size={20} /></span>
          <span className="public-page-eyebrow">ACCOUNT & BILLING</span>
          <h2>Email support</h2>
          <p>For account access, broker setup, wallet, and payment questions.</p>
          <strong>support@vantatrade.ai <Icon name="arrow-right" size={14} /></strong>
        </a>
        <a href="mailto:security@vantatrade.ai" className="contact-card">
          <span className="contact-card-icon"><Icon name="shield" size={20} /></span>
          <span className="public-page-eyebrow">SECURITY</span>
          <h2>Report a security issue</h2>
          <p>Send security concerns directly to the security contact.</p>
          <strong>security@vantatrade.ai <Icon name="arrow-right" size={14} /></strong>
        </a>
      </section>

      <div className="contact-response-note"><Icon name="history" size={17} /><span>Support aims to respond within 24 hours on business days. For payment issues, include the payment reference or request ID if available—never send passwords or secret keys.</span></div>
    </div>
  );
}
