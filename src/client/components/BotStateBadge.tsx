import React from 'react';
import { Badge } from './Badge';
import type { BotState } from '../../shared/types';

const MAP: Record<BotState, { kind: 'success' | 'warn' | 'danger' | 'info' | 'muted'; label: string }> = {
  draft: { kind: 'muted', label: 'Draft' },
  configuring: { kind: 'muted', label: 'Configuring' },
  ready: { kind: 'info', label: 'Ready' },
  starting: { kind: 'info', label: 'Starting' },
  running: { kind: 'success', label: 'Running' },
  analyzing: { kind: 'info', label: 'Analyzing' },
  executing: { kind: 'info', label: 'Executing' },
  managing: { kind: 'info', label: 'Managing' },
  paused: { kind: 'warn', label: 'Paused' },
  stopping: { kind: 'warn', label: 'Stopping' },
  management_only: { kind: 'warn', label: 'Management Only' },
  reconnecting: { kind: 'warn', label: 'Reconnecting' },
  error: { kind: 'danger', label: 'Error' },
  stopped: { kind: 'muted', label: 'Stopped' },
};

export function BotStateBadge({ state }: { state: BotState }): JSX.Element {
  const cfg = MAP[state] ?? { kind: 'muted', label: state };
  return <Badge kind={cfg.kind}>{cfg.label}</Badge>;
}