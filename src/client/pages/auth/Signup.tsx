import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth-context';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { AuthShell } from '../../components/AuthShell';
import { Icon } from '../../components/Icon';
import { ApiRequestError } from '../../api';

export function Signup(): JSX.Element {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', country: 'NG',
    acceptTerms: false, acceptRisk: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.acceptTerms || !form.acceptRisk) {
      setError('Please accept the terms and risk disclosure to continue');
      return;
    }
    setLoading(true);
    try {
      await signup({
        fullName: form.fullName, email: form.email.trim().toLowerCase(),
        password: form.password, country: form.country,
        acceptTerms: true, acceptRisk: true,
      });
      navigate('/app/dashboard');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell mode="signup">
      <form className="auth-form" onSubmit={onSubmit}>
        <Input label="Full name" autoComplete="name" required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="Your full name" />
        <Input label="Email address" type="email" autoComplete="email" required value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
        <Input label="Password (minimum 10 characters)" type="password" autoComplete="new-password" required minLength={10} value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Create a strong password" />
        <Input label="Country code (ISO 2)" autoComplete="country" required maxLength={2} value={form.country} onChange={(e) => set('country', e.target.value.toUpperCase())} placeholder="NG" />

        <label className="auth-consent">
          <input type="checkbox" checked={form.acceptTerms} onChange={(e) => set('acceptTerms', e.target.checked)} />
          <span>I accept the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.</span>
        </label>
        <label className="auth-consent">
          <input type="checkbox" checked={form.acceptRisk} onChange={(e) => set('acceptRisk', e.target.checked)} />
          <span>I have read and accept the <Link to="/risk-disclosure">Risk Disclosure</Link>.</span>
        </label>

        {error && <div className="error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
        <Button type="submit" loading={loading} className="auth-submit-button">Create Account <Icon name="arrow-right" size={15} /></Button>
      </form>
      <div className="auth-form-switch">Already have an account? <Link to="/login">Sign in</Link></div>
    </AuthShell>
  );
}