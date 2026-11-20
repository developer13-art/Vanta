import React from 'react';

export function Terms(): JSX.Element {
  return (
    <div className="public-section">
      <h2>Terms of Service</h2>
      <p>
        By using VANTA Trade AI you agree that the platform provides automation tooling only.
        It does not provide investment advice, portfolio management, or custody of funds.
        You retain full responsibility for your broker account, trading decisions, and risk exposure.
      </p>
      <p>
        Trading involves substantial risk of loss. No profit, win rate, or outcome is guaranteed.
        Credits represent platform usage, not trading capital or a financial instrument, and are non-transferable.
      </p>
      <p>
        You are responsible for complying with your broker's terms and all applicable laws in your jurisdiction.
        VANTA may suspend accounts that violate these terms or attempt to abuse the platform.
      </p>
    </div>
  );
}