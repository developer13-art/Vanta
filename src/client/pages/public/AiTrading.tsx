import React from 'react';

export function AiTrading(): JSX.Element {
  return (
    <div className="public-section">
      <h2>AI-Assisted, Not AI-Controlled</h2>
      <p>
        AI Adaptive bots review one-minute candles, live quotes, trend, momentum, and volatility every two
        minutes. The AI can recommend only BUY, SELL, HOLD, or NO_TRADE. An independent risk engine
        verifies every proposed entry; the model cannot change position size, credentials, or risk limits.
      </p>
      <div className="grid-2" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="card-title">Adaptive Market Context</div>
          <p>Each assessment combines multiple technical indicators and broker quotes rather than following one fixed entry pattern.</p>
        </div>
        <div className="card">
          <div className="card-title">Bounded AI Context</div>
          <p>The configured AI provider returns a validated decision for each selected instrument. One batched assessment costs 2 VANTA credits.</p>
        </div>
        <div className="card">
          <div className="card-title">Independent Risk Engine</div>
          <p>Hard limits are enforced outside the AI path. Every proposal is checked against daily loss, drawdown, margin, and spread limits.</p>
        </div>
        <div className="card">
          <div className="card-title">Fail-Safe Defaults</div>
          <p>Disabled AI, model timeouts, invalid responses, stale quotes, or uncertain outcomes fail to NO_TRADE. The safe path is always the default.</p>
        </div>
      </div>
    </div>
  );
}