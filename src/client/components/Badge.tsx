import React from 'react';

interface Props { kind?: 'success' | 'warn' | 'danger' | 'info' | 'muted'; children: React.ReactNode }

export function Badge({ kind = 'muted', children }: Props): JSX.Element {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}