import React from 'react';
import { Button } from './Button';

interface Props {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  loading?: boolean;
}

export function Modal({ open, title, children, onClose, onConfirm, confirmLabel = 'Confirm', confirmVariant = 'primary', loading }: Props): JSX.Element | null {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-title">{title}</div>
        <div style={{ marginBottom: 20 }}>{children}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          {onConfirm && <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>}
        </div>
      </div>
    </div>
  );
}