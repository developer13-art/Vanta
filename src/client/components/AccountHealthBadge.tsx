import React from 'react';
import { Badge } from './Badge';
import type { BrokerStatus } from '../../shared/types';

const MAP: Record<BrokerStatus, { kind: 'success' | 'warn' | 'danger' | 'info' | 'muted'; label: string }> = {
  not_connected: { kind: 'muted', label: 'Not connected' },
  connecting: { kind: 'info', label: 'Connecting' },
  provisioning: { kind: 'info', label: 'Provisioning' },
  deploying: { kind: 'info', label: 'Deploying' },
  connected: { kind: 'success', label: 'Connected' },
  disconnected: { kind: 'warn', label: 'Disconnected' },
  reconnecting: { kind: 'warn', label: 'Reconnecting' },
  failed: { kind: 'danger', label: 'Failed' },
  requires_attention: { kind: 'warn', label: 'Requires attention' },
  undeployed: { kind: 'muted', label: 'Undeployed' },
};

export function AccountHealthBadge({ status }: { status: BrokerStatus }): JSX.Element {
  const cfg = MAP[status] ?? { kind: 'muted', label: status };
  return <Badge kind={cfg.kind}>{cfg.label}</Badge>;
}