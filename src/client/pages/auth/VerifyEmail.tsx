import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';

export function VerifyEmail(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('Missing token'); return; }
    setStatus('loading');
    api.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err: Error) => { setStatus('error'); setMessage(err.message); });
  }, [token]);

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', padding: 24, textAlign: 'center' }}>
      <h1 className="page-title">Verify Email</h1>
      <div className="card">
        {status === 'loading' && <p>Verifying…</p>}
        {status === 'success' && (
          <>
            <p style={{ color: 'var(--success)', marginBottom: 16 }}>Email verified successfully.</p>
            <Link to="/app/dashboard" className="btn">Go to Dashboard</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{message || 'Verification failed'}</p>
            <Link to="/login">Back to login</Link>
          </>
        )}
      </div>
    </div>
  );
}