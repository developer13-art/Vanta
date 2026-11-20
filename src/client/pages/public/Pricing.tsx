import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import type { CreditPackage } from '../../../shared/types';

export function Pricing(): JSX.Element {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  useEffect(() => { api.listPackages().then(setPackages).catch(() => setPackages([])); }, []);

  return (
    <div className="public-section">
      <h2>Simple, Transparent Credits</h2>
      <p>
        2 credits per open, 2 per close, 2 per AI assessment. No subscriptions.
        Credits never expire under current policy. Emergency safety actions are always free.
      </p>

      <h3 style={{ marginTop: 24, marginBottom: 12 }}>Packages</h3>
      <div className="grid-3">
        {packages.map((p) => (
          <div key={p.code} className="card">
            <div style={{ textTransform: 'capitalize', fontWeight: 600, marginBottom: 8 }}>{p.code}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{p.credits.toLocaleString()} credits</div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 16 }}>${p.priceUsd} · ₦{p.priceNgn.toLocaleString()}</div>
            <Link to="/signup" className="btn" style={{ width: '100%' }}>Get Started</Link>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 32, marginBottom: 12 }}>Examples</h3>
      <table className="table">
        <thead><tr><th>Activity</th><th>Execution credits</th><th>AI credits</th><th>Total</th></tr></thead>
        <tbody>
          <tr><td>5 round trips, 1 assessment</td><td>20</td><td>2</td><td>22</td></tr>
          <tr><td>10 round trips, 1 assessment</td><td>40</td><td>2</td><td>42</td></tr>
          <tr><td>50 round trips, 10 assessments</td><td>200</td><td>20</td><td>220</td></tr>
        </tbody>
      </table>
    </div>
  );
}