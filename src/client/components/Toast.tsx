import React from 'react';
import { useToast } from '../toast-context';

/**
 * Optional explicit toast host. The ToastProvider already renders toasts,
 * but this component can be used to render a persistent stack where needed.
 */
export function ToastHost(): JSX.Element | null {
  // The provider renders its own stack; this is a no-op wrapper that
  // ensures the context is accessible where needed. Kept for API symmetry.
  const _ = useToast();
  void _;
  return null;
}