import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Icon } from '../../components/Icon';
import { useToast } from '../../toast-context';
import type { BotSummary, Position } from '../../../shared/types';

type BotFilter = 'all' | 'running' | 'paused' | 'stopped' | 'attention';

const filters: Array<{ key: BotFilter; label: string }> = [
  { key: 'all', label: 'All Bots' },
  { key: 'running', label: 'Running' },
  { key: 'paused', label: 'Paused' },
  { key: 'stopped', label: 'Stopped' },
  { key: 'attention', label: 'Needs Attention' },
];

function isPaused(state: BotSummary['state']): boolean {
  return state === 'paused' || state === 'management_only';
}

function matchesFilter(bot: BotSummary, filter: BotFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'running') return bot.state === 'running';
  if (filter === 'paused') return isPaused(bot.state);
  if (filter === 'stopped') return bot.state === 'stopped';
  return bot.state === 'error';
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
}

export function Bots(): JSX.Element {
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [filter, setFilter] = useState<BotFilter>('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyBot, setBusyBot] = useState<string | null>(null);
  const toast = useToast();

  const load = async (initial = false) => {
    if (initial) setLoading(true);
    setError(null);
    const [botsResult, positionsResult] = await Promise.allSettled([api.listBots(), api.listOpenPositions()]);
    if (botsResult.status === 'fulfilled') setBots(botsResult.value);
    if (positionsResult.status === 'fulfilled') setPositions(positionsResult.value);
    if (botsResult.status === 'rejected' || positionsResult.status === 'rejected') {
      setError('Some bot information could not be loaded. Refresh to try again.');
    }
    setLoading(false);
  };

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => { void load(); }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const counts = {
    running: bots.filter((bot) => bot.state === 'running').length,
    paused: bots.filter((bot) => isPaused(bot.state)).length,
    stopped: bots.filter((bot) => bot.state === 'stopped').length,
    attention: bots.filter((bot) => bot.state === 'error').length,
  };
  const accounts = [...new Set(bots.map((bot) => bot.broker_account_label))];
  const visibleBots = useMemo(() => {
    const query = search.trim().toLowerCase();
    return bots.filter((bot) => {
      const matchesAccount = accountFilter === 'all' || bot.broker_account_label === accountFilter;
      const matchesSearch = !query || `${bot.name} ${bot.strategy_name} ${bot.broker_account_label}`.toLowerCase().includes(query);
      return matchesFilter(bot, filter) && matchesAccount && matchesSearch;
    });
  }, [accountFilter, bots, filter, search]);

  const positionsByBot = useMemo(() => {
    const result = new Map<string, { count: number; pnl: number | null }>();
    positions.forEach((position) => {
      const current = result.get(position.bot_id) ?? { count: 0, pnl: 0 };
      current.count += 1;
      current.pnl = current.pnl === null || position.floating_pl === null
        ? null
        : current.pnl + Number(position.floating_pl);
      result.set(position.bot_id, current);
    });
    return result;
  }, [positions]);

  const doAction = async (bot: BotSummary, action: 'start' | 'pause' | 'stop') => {
    if (action === 'stop' && !confirm(`Stop new entries for "${bot.name}"? Existing positions will continue to be managed.`)) return;
    setBusyBot(bot.id);
    try {
      if (action === 'start') await api.startBot(bot.id);
      else if (action === 'pause') await api.pauseBot(bot.id);
      else await api.stopBot(bot.id, 'stop_new_manage_existing');
      toast.success(`${action === 'start' ? 'Start' : action === 'pause' ? 'Pause' : 'Stop'} request submitted`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : `Could not ${action} bot`);
    } finally {
      setBusyBot(null);
    }
  };

  return (
    <div className="bots-page">
      {error && <div className="bots-alert" role="status">{error}</div>}

      <header className="bots-heading">
        <div className="bots-title-wrap">
          <span className="bots-title-icon"><Icon name="bot" size={29} /></span>
          <div><h1>AI Bots</h1><p>Manage and monitor your trading bots.</p></div>
        </div>
        <Link to="/app/bots/new" className="bots-create-button"><Icon name="plus" size={17} /> Create New Bot</Link>
      </header>

      <section className="bots-summary">
        <article className="bots-stat"><span className="bots-stat-icon bots-icon-blue"><Icon name="bot" size={20} /></span><div><span>Total Bots</span><strong>{loading ? '—' : bots.length}</strong></div></article>
        <article className="bots-stat"><span className="bots-stat-icon bots-icon-green"><Icon name="rocket" size={20} /></span><div><span>Running</span><strong>{loading ? '—' : counts.running}</strong></div></article>
        <article className="bots-stat"><span className="bots-stat-icon bots-icon-gold"><Icon name="history" size={20} /></span><div><span>Paused</span><strong>{loading ? '—' : counts.paused}</strong></div></article>
        <article className="bots-stat"><span className="bots-stat-icon bots-icon-red"><Icon name="positions" size={20} /></span><div><span>Stopped</span><strong>{loading ? '—' : counts.stopped}</strong></div></article>
      </section>

      <section className="bots-list-panel">
        <div className="bots-toolbar">
          <div className="bots-filter-tabs" role="group" aria-label="Filter bots by status">
            {filters.map((item) => {
              const count = item.key === 'all' ? bots.length : counts[item.key];
              return (
                <button type="button" key={item.key} className={filter === item.key ? 'active' : ''} aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
                  {item.label} <span>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="bots-filter-controls">
            <label className="bots-search"><Icon name="search" size={16} /><input aria-label="Search bots" placeholder="Search bots..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <select className="bots-account-select" aria-label="Filter bots by account" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
              <option value="all">All Accounts</option>
              {accounts.map((account) => <option key={account} value={account}>{account}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="bots-empty-state">Loading your bots…</div>
        ) : visibleBots.length === 0 ? (
          <div className="bots-empty-state">
            <span className="bots-empty-icon"><Icon name="bot" size={25} /></span>
            <strong>{bots.length === 0 ? 'No bots yet' : 'No bots match these filters'}</strong>
            <p>{bots.length === 0 ? 'Connect an account and create your first trading bot.' : 'Try a different search or status filter.'}</p>
            {bots.length === 0 && <Link to="/app/bots/new" className="bots-create-button"><Icon name="plus" size={16} /> Create your first bot</Link>}
          </div>
        ) : (
          <div className="bots-list">
            {visibleBots.map((bot, index) => {
              const botPositionSummary = positionsByBot.get(bot.id) ?? { count: 0, pnl: 0 };
              const stateLabel = bot.state.replace(/_/g, ' ');
              return (
                <article className="bot-list-card" key={bot.id}>
                  <div className={`bot-card-emblem bot-emblem-${index % 4}`}><Icon name="bot" size={25} /></div>
                  <div className="bot-card-main">
                    <div className="bot-card-title">
                      <Link to={`/app/bots/${bot.id}`}>{bot.name}</Link>
                      <span className={`bot-card-status bot-status-${bot.state === 'running' ? 'running' : isPaused(bot.state) ? 'paused' : bot.state === 'error' ? 'error' : 'stopped'}`}>
                        <i />{stateLabel}
                      </span>
                    </div>
                    <div className="bot-card-subtitle">{bot.strategy_name === 'ai_adaptive' ? 'AI Adaptive' : bot.strategy_name.replace(/_/g, ' ')} <span>·</span> v{bot.strategy_version}</div>
                    <div className="bot-card-meta">
                      <span><Icon name="markets" size={13} /> {bot.instrument_count} instrument{bot.instrument_count === 1 ? '' : 's'}</span>
                      <span><Icon name="broker" size={13} /> {bot.broker_account_label}</span>
                      <span className={`bot-mode-tag ${bot.broker_mode}`}>{bot.broker_mode}</span>
                    </div>
                    <div className="bot-card-feedback">
                      <strong>{bot.last_decision_verdict ?? (bot.state === 'running' ? 'Waiting for first analysis' : 'No analysis yet')}</strong>
                      <span>{bot.last_decision_summary ?? 'Start the bot to begin receiving AI analysis feedback.'}</span>
                      {bot.last_decision_at && <small>Checked {new Date(bot.last_decision_at).toLocaleTimeString()}</small>}
                    </div>
                  </div>

                  <div className="bot-card-metric"><span>Open Positions</span><strong>{botPositionSummary.count}</strong></div>
                  <div className="bot-card-metric"><span>Floating P/L</span><strong className={botPositionSummary.pnl === null ? '' : botPositionSummary.pnl >= 0 ? 'bots-pnl-positive' : 'bots-pnl-negative'}>
                    {botPositionSummary.pnl === null ? '—' : `${botPositionSummary.pnl > 0 ? '+' : botPositionSummary.pnl < 0 ? '−' : ''}${formatAmount(botPositionSummary.pnl)}`}
                  </strong></div>

                  <div className="bot-card-actions">
                    {bot.state === 'running' ? (
                      <>
                        <button type="button" className="bot-action-button bot-pause-button" disabled={busyBot === bot.id} onClick={() => void doAction(bot, 'pause')}>Pause</button>
                        <button type="button" className="bot-action-button bot-stop-button" disabled={busyBot === bot.id} onClick={() => void doAction(bot, 'stop')}>Stop</button>
                      </>
                    ) : (
                      <button type="button" className="bot-action-button bot-start-button" disabled={busyBot === bot.id} onClick={() => void doAction(bot, 'start')}>Start</button>
                    )}
                    <Link to={`/app/bots/${bot.id}`} className="bot-detail-button">Configure <Icon name="arrow-right" size={14} /></Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {counts.attention > 0 && (
        <div className="bots-attention-note"><Icon name="shield" size={17} /><span><strong>{counts.attention} bot{counts.attention === 1 ? '' : 's'} need attention.</strong> Review their status and recent decisions before restarting.</span></div>
      )}
    </div>
  );
}
