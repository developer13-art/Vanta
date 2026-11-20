import React from 'react';

const CATEGORIES = [
  { name: 'Forex Majors', examples: 'EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD' },
  { name: 'Forex Minors', examples: 'EURGBP, EURJPY, GBPJPY, AUDJPY, GBPCAD' },
  { name: 'Forex Exotics', examples: 'USDZAR, USDMXN, USDTRY, EURTRY' },
  { name: 'Metals', examples: 'XAUUSD, XAGUSD, platinum symbols' },
  { name: 'Indices', examples: 'US30, NAS100, US500, GER40, UK100, JP225' },
  { name: 'Energy', examples: 'USOIL, UKOIL, NATGAS' },
  { name: 'Crypto CFDs', examples: 'BTCUSD, ETHUSD, SOLUSD' },
];

export function Markets(): JSX.Element {
  return (
    <div className="public-section">
      <h2>Multi-Instrument by Design</h2>
      <p>
        VANTA is instrument-independent. Your broker determines what's actually available — we discover symbols
        per account and map them to a canonical identity. These examples are illustrative, not guaranteed.
      </p>
      <table className="table" style={{ marginTop: 24 }}>
        <thead><tr><th>Category</th><th>Examples</th></tr></thead>
        <tbody>
          {CATEGORIES.map((c) => (
            <tr key={c.name}><td><strong>{c.name}</strong></td><td style={{ color: 'var(--text-muted)' }}>{c.examples}</td></tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 16, fontSize: 12 }}>
        Symbol names vary per broker (e.g. XAUUSDm, XAUUSD.a). VANTA maps broker spelling to a canonical identity — the exact available list is discovered from your account.
      </p>
    </div>
  );
}