import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth-context';

export function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }): JSX.Element {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/app/dashboard" replace />;
  return <>{children}</>;
}