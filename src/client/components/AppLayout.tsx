import React, { FormEvent, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
  { label: 'Support', to: '/contact', icon: 'help', group: 'Manage' },
];

function BrandMark(): JSX.Element {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M4 9 17 5l7 14L31 5l13 4-20 34z" fill="currentColor" />
      <path d="m17 5 7 14-7 13L4 9z" fill="currentColor" opacity=".58" />
    </svg>
  );
}

export function AppLayout(): JSX.Element {
  const { email, fullName, emailVerified, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [marketSearch, setMarketSearch] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const displayName = (fullName?.trim() || (email?.split('@')[0] ?? '').replace(/[._-]+/g, ' '))
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Trader';
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1)).join('').toUpperCase();
  const isMoreActive = !['/app/dashboard', '/app/markets', '/app/bots', '/app/wallet']
    .some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));

  useEffect(() => {
    let active = true;
    Promise.allSettled([api.getWallet(), api.listNotifications({ unreadOnly: true, limit: 10 })]).then(([wallet, notifications]) => {
      if (!active) return;
      if (wallet.status === 'fulfilled') setCreditBalance(wallet.value.available_credits);
      if (notifications.status === 'fulfilled') setUnreadCount(notifications.value.length);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);
  const searchMarkets = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = marketSearch.trim();
    closeMobileMenu();
    navigate(query ? `/app/markets?search=${encodeURIComponent(query)}` : '/app/markets');
  };
  const signOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside id="app-navigation-drawer" className={`app-sidebar${mobileMenuOpen ? ' is-open' : ''}`}>
        <div className="app-sidebar-heading">
          <Link to="/app/dashboard" className="app-brand" onClick={closeMobileMenu}>
            <BrandMark />
            <span><strong>VANTA</strong><small>Trade AI</small></span>
          </Link>
          <button type="button" className="app-drawer-close" onClick={closeMobileMenu} aria-label="Close navigation">
            <Icon name="close" size={19} />
          </button>
        </div>

        <nav className="app-navigation" aria-label="Main navigation">
          {['Workspace', 'Account', 'Manage'].map((group) => (
            <div className="app-nav-group" key={group}>
              {group !== 'Workspace' && <div className="app-nav-divider" />}
              <span className="app-nav-label">{group}</span>
              {navigation.filter((item) => item.group === group).map((item) => item.hash ? (
                <Link key={item.to} to={item.to} className="app-nav-link" onClick={closeMobileMenu}>
                  <Icon name={item.icon} size={17} /><span>{item.label}</span>
                </Link>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/app/dashboard'}
                  onClick={closeMobileMenu}
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
              <NavLink to="/admin/overview" className="app-nav-link" onClick={closeMobileMenu}>
                <Icon name="shield" size={17} /><span>Admin</span>
              </NavLink>
            </div>
          )}
        </nav>

        <div className="app-sidebar-promo">
          <div className="app-promo-icon"><Icon name="broker" size={22} /></div>
          <strong>Build your trading workspace</strong>
          <p>Connect an account to discover instruments and set up your first bot.</p>
          <Link to="/app/brokers/new" onClick={closeMobileMenu}>Connect broker <Icon name="arrow-right" size={14} /></Link>
        </div>
        <div className="app-version">VANTA Trade AI <span>v1.0.0</span></div>
      </aside>

      {mobileMenuOpen && <button type="button" className="app-mobile-scrim" onClick={closeMobileMenu} aria-label="Close navigation" />}

      <div className="app-main">
        <header className="app-topbar">
          <Link to="/app/dashboard" className="app-mobile-brand" aria-label="VANTA Trade AI dashboard">
            <BrandMark />
            <span><strong>VANTA</strong><small>Trade AI</small></span>
          </Link>
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
            <Link to="/app/notifications" className="app-notification-button" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
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
              onClick={() => void signOut()}
            >
              <Icon name="logout" size={17} />
            </button>
            <button
              type="button"
              className="app-mobile-menu-button"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-controls="app-navigation-drawer"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              <Icon name={mobileMenuOpen ? 'close' : 'menu'} size={21} />
            </button>
          </div>
        </header>
        <main className="app-content"><Outlet /></main>
      </div>

      <nav className="app-mobile-bottom-nav" aria-label="Quick navigation">
        <NavLink to="/app/dashboard" end onClick={closeMobileMenu} className={({ isActive }) => `app-mobile-nav-item${isActive ? ' active' : ''}`}>
          <Icon name="home" size={19} /><span>Home</span>
        </NavLink>
        <NavLink to="/app/markets" onClick={closeMobileMenu} className={({ isActive }) => `app-mobile-nav-item${isActive ? ' active' : ''}`}>
          <Icon name="markets" size={19} /><span>Markets</span>
        </NavLink>
        <NavLink to="/app/bots" onClick={closeMobileMenu} className={({ isActive }) => `app-mobile-nav-item${isActive ? ' active' : ''}`}>
          <Icon name="bot" size={19} /><span>Bots</span>
        </NavLink>
        <NavLink to="/app/wallet" onClick={closeMobileMenu} className={({ isActive }) => `app-mobile-nav-item${isActive ? ' active' : ''}`}>
          <Icon name="wallet" size={19} /><span>Wallet</span>
        </NavLink>
        <button type="button" className={`app-mobile-nav-item${mobileMenuOpen || isMoreActive ? ' active' : ''}`} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>
          <Icon name="more" size={19} /><span>More</span>
        </button>
      </nav>
    </div>
  );
}
