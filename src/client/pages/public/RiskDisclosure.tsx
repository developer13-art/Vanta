import React from 'react';

export function RiskDisclosure(): JSX.Element {
  return (
    <div className="public-section">
      <h2>Risk Disclosure</h2>
      <p>
        Automated trading involves substantial risk of loss. Past performance, strategy backtests, and
        demo results do not guarantee future results. Positions may close at a loss due to market movement,
        execution, spread, slippage, commissions, or other costs.
      </p>
      <p>
        You are solely responsible for your trading decisions, risk configuration, and account funding.
        VANTA does not provide investment advice and does not guarantee any trading outcome.
      </p>
      <p>Never trade with money you cannot afford to lose.</p>
    </div>
  );
}