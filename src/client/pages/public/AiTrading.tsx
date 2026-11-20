import React from 'react';

export function AiTrading(): JSX.Element {
  return (
    <div className="public-section">
      <h2>AI-Assisted, Not AI-Controlled</h2>
      <p>
        The VANTA platform uses a layered architecture. Market data flows through quantitative analysis,
        strategy evaluation, and a bounded AI assessment. The risk engine independently verifies every
        proposal — the AI can never override hard limits, change credentials, or place arbitrary orders.
      </p>
      <div className="grid-2" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="card-title">Deterministic Strategies</div>
          <p>Trend, momentum, mean-reversion, and breakout strategies evaluate live market conditions against configurable parameters.</p>
        </div>
        <div className="card">
          <div className="card-title">Bounded AI Context</div>
          <p>AI interprets structure and returns BUY/SELL/HOLD/NO_TRADE with confidence — never executes directly.</p>
        </div>
        <div className="card">
          <div className="card-title">Independent Risk Engine</div>
          <p>Hard limits are enforced outside the AI path. Every proposal is checked against daily loss, drawdown, margin, and spread limits.</p>
        </div>
        <div className="card">
          <div className="card-title">Fail-Safe Defaults</div>
          <p>Model timeouts, stale data, or uncertain outcomes fail to NO_TRADE. The safe path is always the default.</p>
        </div>
      </div>
    </div>
  );
}