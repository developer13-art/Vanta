import React from 'react';

interface Props {
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, message, action }: Props): JSX.Element {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {message && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{message}</div>}
      {action && (
        <button className="btn" onClick={action.onClick}>{action.label}</button>
      )}
    </div>
  );
}