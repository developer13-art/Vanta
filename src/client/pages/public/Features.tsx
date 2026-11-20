import React from 'react';

export function Features(): JSX.Element {
  return (
    <div className="public-section">
      <h2>Everything You Need</h2>
      <div className="grid-2" style={{ marginTop: 24 }}>
        {[
          ['Cloud-Hosted', 'No PC, VPS, or terminal required. Bots run continuously in the cloud.'],
          ['Multi-Instrument', 'Trade any broker-supported instrument — forex, metals, indices, energy, crypto CFDs.'],
          ['Hard Risk Limits', 'Independent risk engine enforces daily loss, drawdown, margin, and spread limits.'],
          ['Full Audit Trail', 'Every decision, order, and billing event is recorded and traceable.'],
          ['Demo-First', 'Test strategies on demo accounts before authorizing live trading.'],
          ['Transparent Credits', 'Prepaid credits, immutable ledger, no subscriptions or surprise fees.'],
          ['Automatic Reconciliation', 'Broker-side changes are detected and reconciled into platform state.'],
          ['Safety-Grade Controls', 'Emergency halt, close-all, and manual override with confirmation.'],
        ].map(([title, desc]) => (
          <div key={title} className="card">
            <div className="card-title">{title}</div>
            <p>{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}