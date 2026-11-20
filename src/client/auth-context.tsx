import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokens, ApiRequestError } from './api';

interface AuthState {
  userId: string | null;
  email: string | null;
  fullName: string | null;
  emailVerified: boolean;
  roles: string[];
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (body: Parameters<typeof api.signup>[0]) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeJwtRoles(token: string): string[] {
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return [];
    const payload: unknown = JSON.parse(atob(payloadSegment));
    if (typeof payload !== 'object' || payload === null || !('roles' in payload) || !Array.isArray(payload.roles)) return [];
    return payload.roles.filter((role): role is string => typeof role === 'string');
  } catch { return []; }
}

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [state, setState] = useState<AuthState>({
    userId: null, email: null, fullName: null, emailVerified: false, roles: [], loading: true, error: null,
  });

  const refreshMe = useCallback(async () => {
    if (!tokens.access) {
      setState({ userId: null, email: null, fullName: null, emailVerified: false, roles: [], loading: false, error: null });
      return;
    }
    try {
      const me = await api.me();
      setState({
        userId: me.id,
        email: me.email,
        fullName: me.full_name,
        emailVerified: !!me.email_verified_at,
        roles: decodeJwtRoles(tokens.access!),
        loading: false,
        error: null,
      });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) tokens.clear();
      setState({ userId: null, email: null, fullName: null, emailVerified: false, roles: [], loading: false, error: null });
    }
  }, []);

  useEffect(() => { void refreshMe(); }, [refreshMe]);

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await api.login({ email, password });
      tokens.set(res.accessToken, res.refreshToken);
      setState({
        userId: res.user.id,
        email,
        fullName: res.user.fullName,
        emailVerified: res.user.emailVerified,
        roles: res.user.roles,
        loading: false,
        error: null,
      });
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Login failed';
      setState((s) => ({ ...s, loading: false, error: msg }));
      throw err;
    }
  }, []);

  const signup = useCallback(async (body: Parameters<typeof api.signup>[0]) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await api.signup(body);
      tokens.set(res.accessToken, '');
      setState({
        userId: res.userId,
        email: body.email,
        fullName: body.fullName,
        emailVerified: false,
        roles: [],
        loading: false,
        error: null,
      });
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Signup failed';
      setState((s) => ({ ...s, loading: false, error: msg }));
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setState({ userId: null, email: null, fullName: null, emailVerified: false, roles: [], loading: false, error: null });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    isAuthenticated: !!state.userId,
    isAdmin: state.roles.includes('admin'),
    login, signup, logout, refreshMe,
  }), [state, login, signup, logout, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}