import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiRequestError } from '../../api';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';

export function ResetPassword(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) { setError('Missing token'); return; }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', padding: 24 }}>
      <h1 className="page-title">Reset Password</h1>
      <div className="card">
        <form onSubmit={onSubmit}>
          <Input label="New password (min 10 chars)" type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
          <Button type="submit" loading={loading} style={{ width: '100%' }}>Update password</Button>
        </form>
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
          <Link to="/login">Back to login</Link>
        </div>
      </div>
    </div>
  );
}