import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

export function AdminLayout(): JSX.Element {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">VANTA Admin</div>
        <NavLink to="/admin/overview">Overview</NavLink>
        <NavLink to="/admin/users">Users</NavLink>
        <NavLink to="/admin/broker-accounts">Broker Accounts</NavLink>
        <NavLink to="/admin/bots">Bots</NavLink>
        <NavLink to="/admin/execution">Execution</NavLink>
        <NavLink to="/admin/credits">Credits</NavLink>
        <NavLink to="/admin/payments">Payments</NavLink>
        <NavLink to="/admin/ai-strategies">AI & Strategies</NavLink>
        <NavLink to="/admin/market-data">Market Data</NavLink>
        <NavLink to="/admin/risk-controls">Risk Controls</NavLink>
        <NavLink to="/admin/infrastructure">Infrastructure</NavLink>
        <NavLink to="/admin/security">Security</NavLink>
        <NavLink to="/admin/emergency">Emergency</NavLink>
        <NavLink to="/admin/audit">Audit</NavLink>
        <NavLink to="/admin/jobs">Jobs</NavLink>
      </aside>
      <div className="main">
        <header className="topbar"><div>Admin Console</div></header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}