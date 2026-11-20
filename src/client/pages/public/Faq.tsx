import React, { useState } from 'react';

const ITEMS = [
  ['Do I need to keep my PC running?', 'No. VANTA runs in the cloud and connects to your broker through MetaApi — you do not need any local terminal.'],
  ['Which brokers are supported?', 'Any broker that offers MT4 or MT5 and supports MetaApi connectivity. Your available instruments are discovered from your account.'],
  ['Can I test without risking money?', 'Yes. Demo accounts are fully supported and recommended first. Live trading requires a separate authorization step.'],
  ['How are credits charged?', '2 credits per individual order open, 2 per individual close, 2 per AI assessment. Rejected orders and internal retries are free.'],
  ['What happens when my wallet hits zero?', 'New billable entries and discretionary AI are blocked. Existing positions stay in management-only safety mode. Emergency actions remain free.'],
  ['Can the AI place trades on its own?', 'The AI produces bounded decisions. Every proposal is verified by an independent risk engine before submission. AI cannot override limits.'],
  ['Do you take custody of funds?', 'No. Your capital stays in your own broker account. The platform never requests withdrawal permission.'],
  ['Are profits guaranteed?', 'No. Trading involves substantial risk. Past performance does not guarantee future results.'],
];

export function Faq(): JSX.Element {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="public-section">
      <h2>Frequently Asked Questions</h2>
      <div style={{ marginTop: 24 }}>
        {ITEMS.map(([q, a], i) => (
          <div key={i} style={{ borderBottom: '1px solid var(--border)', padding: '16px 0' }}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              style={{ background: 'none', border: 'none', color: 'var(--text)', width: '100%', textAlign: 'left', fontWeight: 600, fontSize: 15 }}
            >
              {open === i ? '−' : '+'} {q}
            </button>
            {open === i && <p style={{ marginTop: 12 }}>{a}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}