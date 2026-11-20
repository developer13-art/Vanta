import React from 'react';

export type IconName =
  | 'dashboard' | 'markets' | 'bot' | 'positions' | 'history' | 'performance'
  | 'broker' | 'wallet' | 'credits' | 'notifications' | 'settings' | 'shield'
  | 'search' | 'arrow-right' | 'plus' | 'rocket' | 'analytics' | 'logout' | 'refresh';

const paths: Record<IconName, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  markets: <><path d="M3 17 9 11l4 4 8-9" /><path d="M15 6h6v6" /></>,
  bot: <><rect x="4" y="7" width="16" height="13" rx="4" /><path d="M12 3v4M8 13h.01M16 13h.01M9 17h6" /><path d="M2 12h2M20 12h2" /></>,
  positions: <><path d="M4 19V9m5 10V5m5 14v-7m5 7V3" /><path d="M2 19h20" /></>,
  history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2M4 4l2 2" /></>,
  performance: <><path d="M3 20h18M5 16l5-5 4 3 6-8" /><path d="M16 6h4v4" /></>,
  broker: <><path d="M3 21h18M5 18V9m5 9V9m4 9V9m5 9V9M3 6l9-3 9 3v2H3z" /></>,
  wallet: <><path d="M4 6.5h15a2 2 0 0 1 2 2V19H5a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12" /><path d="M16 12h5v4h-5a2 2 0 0 1 0-4z" /></>,
  credits: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v5c0 1.7 3.6 3 8 3 1 0 1.9-.1 2.8-.2M4 11v5c0 1.7 3.6 3 8 3" /><path d="M20 12v7m-3.5-3.5h7" /></>,
  notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.2.9-1.2 2.1-1.4-.5a8 8 0 0 1-1.5.9l-.2 1.5h-2.5l-.2-1.5a8 8 0 0 1-1.5-.9l-1.4.5-1.2-2.1 1.2-.9a8 8 0 0 1 0-1.8l-1.2-.9 1.2-2.1 1.4.5a8 8 0 0 1 1.5-.9l.2-1.5h2.5l.2 1.5a8 8 0 0 1 1.5.9l1.4-.5 1.2 2.1-1.2.9a8 8 0 0 1 0 1.8z" transform="translate(-1 -1)" /></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z" /><path d="m9 12 2 2 4-4" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
  'arrow-right': <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  rocket: <><path d="M5 15c-1.5 1-2 4-2 4s3-.5 4-2l2-2-2-2zM9 13l4 4c4-2 7-7 8-14-7 1-12 4-14 8l2 2z" /><circle cx="15" cy="9" r="1" /></>,
  analytics: <><path d="M4 20V10m5 10V4m5 16v-7m5 7V7" /><path d="M2 20h20" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
