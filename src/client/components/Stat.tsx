import React from 'react';

export function Stat({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}