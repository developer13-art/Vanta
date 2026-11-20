import React from 'react';

export function RiskSafety(): JSX.Element {
  return (
    <div className="public-section">
      <h2>Risk and Safety</h2>
      <p>
        Trading involves substantial risk of loss. VANTA never guarantees profits, win rates, or fixed outcomes.
        The platform is built around layered defenses so that even in failure modes, your positions are not abandoned.
      </p>
      <div className="grid-2" style={{ marginTop: 24 }}>
        {[
          ['Hard Risk Limits', 'Max positions, max lot, daily loss, drawdown, margin utilization, spread — enforced independently.'],
          ['Emergency Controls', 'Halt new entries by user, account, or globally. Essential management continues.'],
          ['Broker-Confirmed State', 'Position and order state is reconciled against the broker, not assumed.'],
          ['Demo-First', 'Live trading requires separate authorization after demo evaluation.'],
          ['No Withdrawals', 'The platform never requests withdrawal permission on broker credentials.'],
          ['Fail-Safe', 'Model timeouts and data staleness fail to NO_TRADE — never to a trade.'],
        ].map(([title, desc]) => (
          <div key={title} className="card">
            <div className="card-title">{title}</div>
            <p>{desc}</p>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 24, padding: 16, background: 'rgba(239,68,68,0.1)', borderRadius: 8, color: 'var(--text)' }}>
        <strong>Important:</strong> Positions may close at a loss due to market movement, execution, spread, slippage, commissions, or other costs.
        Never trade with money you cannot afford to lose.
      </p>
    </div>
  );
}