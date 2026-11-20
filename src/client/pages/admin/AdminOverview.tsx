import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Stat } from '../../components/Stat';

export function AdminOverview(): JSX.Element {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.adminOverview>> | null>(null);
  useEffect(() => { api.adminOverview().then(setData); }, []);

  if (!data) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-title">Admin Overview</h1>
      <div className="grid-3">
        <Stat label="Total users" value={data.users.total} />
        <Stat label="Active users" value={data.users.active} />
        <Stat label="Broker accounts" value={data.accounts.total} />
        <Stat label="Connected" value={data.accounts.connected} />
        <Stat label="Live accounts" value={data.accounts.live} />
        <Stat label="Total bots" value={data.bots.total} />
        <Stat label="Running bots" value={data.bots.running} />
        <Stat label="Credits sold" value={data.credits.credits_sold} />
        <Stat label="Credits used" value={data.credits.credits_used} />
      </div>
    </div>
  );
}