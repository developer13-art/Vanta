import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth-context';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { AuthShell } from '../../components/AuthShell';
import { Icon } from '../../components/Icon';
import { ApiRequestError } from '../../api';

export function Login(): JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      const from = (location.state as { from?: string } | null)?.from ?? '/app/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell mode="login">
      <form className="auth-form" onSubmit={onSubmit}>
        <Input label="Email address" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
        <div className="auth-form-options"><span>Use your registered email address</span><Link to="/forgot-password">Forgot password?</Link></div>
        {error && <div className="error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
        <Button type="submit" loading={loading} className="auth-submit-button">Sign In <Icon name="arrow-right" size={15} /></Button>
      </form>
      <div className="auth-form-switch">New to VANTA? <Link to="/signup">Create an account</Link></div>
    </AuthShell>
  );
}