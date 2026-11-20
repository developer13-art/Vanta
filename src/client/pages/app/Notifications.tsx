import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Icon } from '../../components/Icon';
import { useToast } from '../../toast-context';
import type { Notification, NotificationCategory } from '../../../shared/types';

const categories: Array<{ value: 'all' | NotificationCategory; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'system', label: 'System' },
  { value: 'trading', label: 'Trading' },
  { value: 'broker', label: 'Broker' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'security', label: 'Security' },
];

function notificationTarget(actionUrl: string | null): string | null {
  if (!actionUrl || !actionUrl.startsWith('/') || actionUrl.startsWith('//')) return null;
  if (actionUrl.startsWith('/app/')) return actionUrl;
  const [path, suffix = ''] = actionUrl.split(/(?=[?#])/);
  if (!path) return null;
  const routes: Record<string, string> = {
    '/wallet': '/app/wallet',
    '/brokers': '/app/brokers',
    '/bots': '/app/bots',
    '/positions': '/app/positions',
    '/settings': '/app/settings',
  };
  const target = routes[path];
  return target ? `${target}${suffix}` : null;
}

function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Date unavailable';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

export function Notifications(): JSX.Element {
  const toast = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [category, setCategory] = useState<'all' | NotificationCategory>('all');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.listNotifications({ limit: 100 })
      .then(setItems)
      .catch((cause: unknown) => setError(cause instanceof ApiRequestError ? cause.message : 'Notifications could not be loaded.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const visibleItems = useMemo(() => items.filter((item) => (
    (category === 'all' || item.category === category) && (!onlyUnread || !item.read_at)
  )), [category, items, onlyUnread]);
  const unreadCount = items.filter((item) => !item.read_at).length;
  const readCount = items.length - unreadCount;
  const criticalCount = items.filter((item) => item.severity === 'critical').length;
  const categoryCounts = useMemo(() => items.reduce<Record<string, number>>((counts, item) => {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, {}), [items]);

  const markRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    } catch (cause) {
      toast.error(cause instanceof ApiRequestError ? cause.message : 'Could not mark notification as read');
    }
  };

  const markVisibleRead = async () => {
    const unreadItems = visibleItems.filter((item) => !item.read_at);
    if (!unreadItems.length) return;
    setBusy(true);
    const results = await Promise.allSettled(unreadItems.map((item) => api.markNotificationRead(item.id)));
    const succeededIds = new Set(unreadItems.filter((_, index) => results[index]?.status === 'fulfilled').map((item) => item.id));
    setItems((current) => current.map((item) => succeededIds.has(item.id) ? { ...item, read_at: new Date().toISOString() } : item));
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
      const firstFailure = failures[0];
      toast.error(firstFailure?.status === 'rejected' && firstFailure.reason instanceof ApiRequestError
        ? `${failures.length} notification${failures.length === 1 ? '' : 's'} could not be updated: ${firstFailure.reason.message}`
        : `${failures.length} notification${failures.length === 1 ? '' : 's'} could not be updated.`);
    } else {
      toast.success(`${succeededIds.size} notification${succeededIds.size === 1 ? '' : 's'} marked as read`);
    }
    setBusy(false);
  };

  return (
    <div className="notifications-page">
      <header className="notifications-heading">
        <div className="notifications-title-wrap">
          <span className="notifications-title-icon"><Icon name="notifications" size={23} /></span>
          <div><span className="notifications-eyebrow">ACCOUNT ACTIVITY</span><h1>Notifications</h1><p>Updates about your trades, accounts, and wallet.</p></div>
        </div>
        <button type="button" className="notifications-mark-all" onClick={markVisibleRead} disabled={busy || loading || visibleItems.every((item) => !!item.read_at)}>
          <Icon name="shield" size={15} />{busy ? 'Updating…' : 'Mark visible as read'}
        </button>
      </header>

      <section className="notifications-summary" aria-label="Recent notification counts">
        <article className="notifications-stat"><span className="notifications-stat-icon notifications-stat-gold"><Icon name="notifications" size={20} /></span><div><span>Recent</span><strong>{loading ? '—' : items.length}</strong><small>Latest 100 records</small></div></article>
        <article className="notifications-stat"><span className="notifications-stat-icon notifications-stat-blue"><Icon name="history" size={20} /></span><div><span>Unread</span><strong>{loading ? '—' : unreadCount}</strong><small>In the loaded list</small></div></article>
        <article className="notifications-stat"><span className="notifications-stat-icon notifications-stat-green"><Icon name="shield" size={20} /></span><div><span>Read</span><strong>{loading ? '—' : readCount}</strong><small>In the loaded list</small></div></article>
        <article className="notifications-stat"><span className="notifications-stat-icon notifications-stat-red"><Icon name="notifications" size={20} /></span><div><span>Critical</span><strong>{loading ? '—' : criticalCount}</strong><small>All categories</small></div></article>
      </section>

      <section className="notifications-panel">
        <div className="notifications-toolbar">
          <div className="notifications-category-tabs" role="tablist" aria-label="Notification categories">
            {categories.map((item) => (
              <button type="button" role="tab" aria-selected={category === item.value} className={category === item.value ? 'active' : ''} key={item.value} onClick={() => setCategory(item.value)}>
                {item.label}<span>{item.value === 'all' ? items.length : (categoryCounts[item.value] ?? 0)}</span>
              </button>
            ))}
          </div>
          <label className="notifications-unread-toggle"><input type="checkbox" checked={onlyUnread} onChange={(event) => setOnlyUnread(event.target.checked)} />Unread only</label>
        </div>

        {error ? (
          <div className="notifications-empty" role="alert"><strong>Notifications unavailable</strong><p>{error}</p><button type="button" onClick={load}>Try again</button></div>
        ) : loading ? (
          <div className="notifications-empty"><span className="dashboard-spinner" /> Loading notifications…</div>
        ) : visibleItems.length === 0 ? (
          <div className="notifications-empty">
            <span className="notifications-empty-icon"><Icon name="notifications" size={22} /></span>
            <strong>{items.length === 0 ? 'You’re all caught up' : 'No notifications in this view'}</strong>
            <p>{items.length === 0 ? 'New account and trading updates will appear here.' : 'Try another category or turn off the unread filter.'}</p>
          </div>
        ) : (
          <div className="notifications-list">
            {visibleItems.map((item) => {
              const target = notificationTarget(item.action_url);
              return (
                <article className={`notification-row${item.read_at ? ' is-read' : ''}`} key={item.id}>
                  <span className={`notification-kind-icon notification-kind-${item.category}`}>
                    <Icon name={item.category === 'trading' ? 'performance' : item.category === 'broker' ? 'broker' : item.category === 'wallet' ? 'wallet' : item.category === 'security' ? 'shield' : 'dashboard'} size={18} />
                  </span>
                  <span className="notification-unread-dot" aria-hidden="true" />
                  <div className="notification-copy">
                    <div className="notification-title-line">
                      <strong>{item.title}</strong>
                      <span className={`notification-severity notification-severity-${item.severity}`}>{item.severity}</span>
                    </div>
                    <p>{item.body}</p>
                    <div className="notification-meta"><span>{item.category}</span><time title={new Date(item.created_at).toLocaleString()}>{relativeTime(item.created_at)}</time></div>
                  </div>
                  <div className="notification-actions">
                    {!item.read_at && <button type="button" onClick={() => markRead(item.id)} aria-label={`Mark ${item.title} as read`} title="Mark as read"><Icon name="shield" size={15} /></button>}
                    {target && <Link to={target} aria-label={`Open ${item.title}`} title="Open related page"><Icon name="arrow-right" size={16} /></Link>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {!loading && !error && items.length > 0 && <footer className="notifications-footer">Showing the latest {items.length} notification{items.length === 1 ? '' : 's'}.</footer>}
      </section>
    </div>
  );
}
