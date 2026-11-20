import React from 'react';

export function HowItWorks(): JSX.Element {
  return (
    <div className="public-section">
      <h2>How VANTA Trade AI Works</h2>
      <p>VANTA runs your configured trading strategies in the cloud using your own broker account. You stay in control at every step.</p>
      <h3 style={{ marginTop: 24, marginBottom: 12 }}>The Flow</h3>
      <ol style={{ paddingLeft: 24, color: 'var(--text-muted)' }}>
        <li style={{ marginBottom: 8 }}>Create an account and verify your email</li>
        <li style={{ marginBottom: 8 }}>Connect your MT4/MT5 account (demo first)</li>
        <li style={{ marginBottom: 8 }}>Discover instruments your broker offers</li>
        <li style={{ marginBottom: 8 }}>Configure a bot with strategy, limits, and stop behavior</li>
        <li style={{ marginBottom: 8 }}>Deploy in demo mode and monitor</li>
        <li style={{ marginBottom: 8 }}>After testing, authorize live trading separately</li>
        <li>Monitor performance, wallet, and broker health</li>
      </ol>
    </div>
  );
}