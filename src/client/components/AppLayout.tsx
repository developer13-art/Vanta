import React, { FormEvent, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { api } from '../api';
import { Badge } from './Badge';
import { Icon, IconName } from './Icon';

const navigation: Array<{ label: string; to: string; icon: IconName; group: string; hash?: true }> = [
  { label: 'Dashboard', to: '/app/dashboard', icon: 'dashboard', group: 'Workspace' },
  { label: 'Markets', to: '/app/markets', icon: 'markets', group: 'Workspace' },
  { label: 'AI Bots', to: '/app/bots', icon: 'bot', group: 'Workspace' },
  { label: 'Open Positions', to: '/app/positions', icon: 'positions', group: 'Workspace' },
  { label: 'Trade History', to: '/app/history', icon: 'history', group: 'Workspace' },
  { label: 'Performance', to: '/app/performance', icon: 'performance', group: 'Workspace' },
  { label: 'Broker Accounts', to: '/app/brokers', icon: 'broker', group: 'Account' },
  { label: 'Credit Wallet', to: '/app/wallet', icon: 'wallet', group: 'Account' },
  { label: 'Buy Credits', to: '/app/wallet#buy-credits', icon: 'credits', group: 'Account', hash: true },
  { label: 'Usage History', to: '/app/wallet#usage-history', icon: 'history', group: 'Account', hash: true },
  { label: 'Notifications', to: '/app/notifications', icon: 'notifications', group: 'Manage' },
  { label: 'Settings', to: '/app/settings', icon: 'settings', group: 'Manage' },
  { label: 'Security', to: '/app/settings#security', icon: 'shield', group: 'Manage', hash: true },
];

export function AppLayout(): JSX.Element {
  const { email, emailVerified, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [marketSearch, setMarketSearch] = useState('');
  const displayName = (email?.split('@')[0] ?? '')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Trader';
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1)).join('').toUpperCase();

  useEffect(() => {
    let active = true;
    Promise.allSettled([api.getWallet(), api.listNotifications({ unreadOnly: true, limit: 10 })]).then(([wallet, notifications]) => {
      if (!active) return;
      if (wallet.status === 'fulfilled') setCreditBalance(wallet.value.available_credits);
      if (notifications.status === 'fulfilled') setUnreadCount(notifications.value.length);
    });
    return () => { active = false; };
  }, []);

  const searchMarkets = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = marketSearch.trim();
    navigate(query ? `/app/markets?search=${encodeURIComponent(query)}` : '/app/markets');
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link to="/app/dashboard" className="app-brand">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M4 9 17 5l7 14L31 5l13 4-20 34z" fill="currentColor" />
            <path d="m17 5 7 14-7 13L4 9z" fill="currentColor" opacity=".58" />
          </svg>
          <span><strong>VANTA</strong><small>Trade AI</small></span>
        </Link>

        <nav className="app-navigation" aria-label="Main navigation">
          {['Workspace', 'Account', 'Manage'].map((group) => (
            <div className="app-nav-group" key={group}>
              {group !== 'Workspace' && <div className="app-nav-divider" />}
              <span className="app-nav-label">{group}</span>
              {navigation.filter((item) => item.group === group).map((item) => item.hash ? (
                <Link key={item.to} to={item.to} className="app-nav-link">
                  <Icon name={item.icon} size={17} /><span>{item.label}</span>
                </Link>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/app/dashboard'}
                  className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}
                >
                  <Icon name={item.icon} size={17} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
          {isAdmin && (
            <div className="app-nav-group">
              <div className="app-nav-divider" />
              <NavLink to="/admin/overview" className="app-nav-link">
                <Icon name="shield" size={17} /><span>Admin</span>
              </NavLink>
            </div>
          )}
        </nav>

        <div className="app-sidebar-promo">
          <div className="app-promo-icon"><Icon name="rocket" size={23} /></div>
          <strong>Get started with AI trading</strong>
          <p>Automate your trades with confidence.</p>
          <Link to="/app/bots/new">Create your bot <Icon name="arrow-right" size={14} /></Link>
        </div>
        <div className="app-version">VANTA Trade AI <span>v1.0.0</span></div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <form className="app-search" role="search" onSubmit={searchMarkets}>
            <Icon name="search" size={19} />
            <input
              aria-label="Search markets"
              placeholder="Search markets... (e.g. EURUSD, XAUUSD)"
              value={marketSearch}
              onChange={(event) => setMarketSearch(event.target.value)}
            />
            <button type="submit" aria-label="Submit market search"><Icon name="arrow-right" size={16} /></button>
          </form>

          <div className="app-topbar-actions">
            {!emailVerified && <Badge kind="warn">Email unverified</Badge>}
            {creditBalance !== null && <Link to="/app/wallet" className="app-credit-link">{creditBalance.toLocaleString()} credits</Link>}
            <Link to="/app/notifications" className="app-notification-button" aria-label="Notifications">
              <Icon name="notifications" size={20} />
              {unreadCount !== null && unreadCount > 0 && <span>{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </Link>
            <div className="app-profile">
              <span className="app-avatar">{initials}</span>
              <span className="app-profile-copy"><strong>{displayName}</strong><small>{isAdmin ? 'Administrator' : 'Trader account'}</small></span>
            </div>
            <button
              type="button"
              className="app-signout"
              aria-label="Sign out"
              onClick={async () => { await logout(); navigate('/login'); }}
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </header>
        <main className="app-content"><Outlet /></main>
      </div>
    </div>
  );
}