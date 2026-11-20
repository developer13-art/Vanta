import React from 'react';

export interface TabDef<T extends string = string> {
  key: T;
  label: string;
  count?: number;
}

interface Props<T extends string = string> {
  tabs: TabDef<T>[];
  active: T;
  onChange: (key: T) => void;
}

export function Tabs<T extends string = string>({ tabs, active, onChange }: Props<T>): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            background: 'none', border: 'none',
            color: active === t.key ? 'var(--primary)' : 'var(--text-muted)',
            padding: '10px 16px', fontSize: 13, fontWeight: 500,
            borderBottom: active === t.key ? '2px solid var(--primary)' : '2px solid transparent',
          }}
        >
          {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
        </button>
      ))}
    </div>
  );
}