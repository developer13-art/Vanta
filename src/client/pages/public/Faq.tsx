import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';

const ITEMS = [
  ['Do I need to keep my PC running?', 'No. VANTA runs in the cloud and connects to your broker through MetaApi — you do not need a local trading terminal.'],
  ['Which brokers are supported?', 'MT4 and MT5 accounts that support MetaApi connectivity. Available instruments are discovered from your connected account.'],
  ['Can I test without risking money?', 'Demo accounts are supported and recommended for getting started. Live trading uses real funds and carries financial risk.'],
  ['How are credits charged?', 'The current published rates are charged per confirmed order open, order close, and AI assessment. Rejected orders and internal retries are not billed.'],
  ['What happens when my wallet hits zero?', 'New billable entries and discretionary AI are blocked. Existing positions stay in management-only safety mode, and emergency actions remain free.'],
  ['Can the AI place trades on its own?', 'AI produces bounded decisions; an independent risk engine verifies proposals before submission. AI cannot override configured risk limits.'],
  ['Do you take custody of funds?', 'No. Your capital remains in your own broker account. The platform does not request withdrawal permission.'],
  ['Are profits guaranteed?', 'No. Trading involves substantial risk, and past performance does not guarantee future results.'],
];

export function Faq(): JSX.Element {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="public-section faq-page">
      <header className="public-page-heading">
        <span className="public-page-eyebrow">HELP CENTER</span>
        <h1>Frequently asked questions</h1>
        <p>Answers about connections, credit usage, and how VANTA keeps you in control.</p>
      </header>
      <section className="faq-list" aria-label="Frequently asked questions">
        {ITEMS.map(([question, answer], index) => {
          const isOpen = open === index;
          const panelId = `faq-answer-${index}`;
          return (
            <article key={question} className={`faq-item${isOpen ? ' is-open' : ''}`}>
              <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpen(isOpen ? null : index)}>
                <span><i>{String(index + 1).padStart(2, '0')}</i>{question}</span><b aria-hidden="true">{isOpen ? '−' : '+'}</b>
              </button>
              {isOpen && <p id={panelId}>{answer}</p>}
            </article>
          );
        })}
      </section>
      <div className="faq-contact-note"><span>Still have a question?</span><Link to="/contact">Contact support <Icon name="arrow-right" size={14} /></Link></div>
    </div>
  );
}
