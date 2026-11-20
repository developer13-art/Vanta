import React, { useState } from 'react';
import { Modal } from './Modal';
import { Input } from './Input';

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmPhrase: string;      // User must type this to enable confirm
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open, title, description, confirmPhrase, confirmLabel = 'Confirm',
  confirmVariant = 'danger', loading, onClose, onConfirm,
}: Props): JSX.Element | null {
  const [phrase, setPhrase] = useState('');

  const handleClose = () => { setPhrase(''); onClose(); };
  const handleConfirm = async () => {
    if (phrase !== confirmPhrase) return;
    await onConfirm();
    setPhrase('');
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={handleClose}
      onConfirm={phrase === confirmPhrase ? handleConfirm : undefined}
      confirmLabel={confirmLabel}
      confirmVariant={confirmVariant}
      loading={loading}
    >
      <p style={{ marginBottom: 16, color: 'var(--text-muted)' }}>{description}</p>
      <Input
        label={`Type "${confirmPhrase}" to confirm`}
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        autoFocus
      />
    </Modal>
  );
}