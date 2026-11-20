import React from 'react';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, children, disabled, className, ...rest }: Props): JSX.Element {
  const cls = ['btn', variant !== 'primary' ? `btn-${variant}` : '', size === 'sm' ? 'btn-sm' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button {...rest} className={cls} disabled={disabled || loading}>
      {loading ? '…' : children}
    </button>
  );
}