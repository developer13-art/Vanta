import React from 'react';

export function Contact(): JSX.Element {
  return (
    <div className="public-section">
      <h2>Contact</h2>
      <p>Questions about VANTA Trade AI? We're here to help.</p>
      <div className="card" style={{ marginTop: 24, maxWidth: 500 }}>
        <div className="field">
          <div className="label">Support</div>
          <a href="mailto:support@vantatrade.ai">support@vantatrade.ai</a>
        </div>
        <div className="field">
          <div className="label">Response time</div>
          <div>Within 24 hours on business days</div>
        </div>
        <div className="field">
          <div className="label">Security issues</div>
          <a href="mailto:security@vantatrade.ai">security@vantatrade.ai</a>
        </div>
      </div>
    </div>
  );
}