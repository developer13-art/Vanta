import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';

export function ForgotPassword(): JSX.Element {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', padding: 24 }}>
      <h1 className="page-title">Forgot Password</h1>
      <div className="card">
        {sent ? (
          <p>If that email is registered, a reset link has been sent.</p>
        ) : (
          <form onSubmit={onSubmit}>
            <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" loading={loading} style={{ width: '100%' }}>Send reset link</Button>
          </form>
        )}
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
          <Link to="/login">Back to login</Link>
        </div>
      </div>
    </div>
  );
}