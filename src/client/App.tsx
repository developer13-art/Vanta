import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth-context';
import { ToastProvider } from './toast-context';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PublicLayout } from './components/PublicLayout';
import { AppLayout } from './components/AppLayout';
import { AdminLayout } from './components/AdminLayout';

import { Home } from './pages/public/Home';
import { HowItWorks } from './pages/public/HowItWorks';
import { AiTrading } from './pages/public/AiTrading';
import { Markets as PublicMarkets } from './pages/public/Markets';
import { Features } from './pages/public/Features';
import { Pricing } from './pages/public/Pricing';
import { RiskSafety } from './pages/public/RiskSafety';
import { Faq } from './pages/public/Faq';
import { Contact } from './pages/public/Contact';
import { Terms } from './pages/public/Terms';
import { Privacy } from './pages/public/Privacy';
import { RiskDisclosure } from './pages/public/RiskDisclosure';
import { CreditRefundPolicy } from './pages/public/CreditRefundPolicy';

import { Login } from './pages/auth/Login';
import { Signup } from './pages/auth/Signup';
import { VerifyEmail } from './pages/auth/VerifyEmail';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';

import { Dashboard } from './pages/app/Dashboard';
import { Markets as AppMarkets } from './pages/app/Markets';
import { Bots } from './pages/app/Bots';
import { BotCreate } from './pages/app/BotCreate';
import { BotDetail } from './pages/app/BotDetail';
import { Brokers } from './pages/app/Brokers';
import { BrokerAdd } from './pages/app/BrokerAdd';
import { BrokerDetail } from './pages/app/BrokerDetail';
import { Positions } from './pages/app/Positions';
import { TradeHistory } from './pages/app/TradeHistory';
import { Performance } from './pages/app/Performance';
import { Wallet } from './pages/app/Wallet';
import { Notifications } from './pages/app/Notifications';
import { Settings } from './pages/app/Settings';
import { LiveTradingAuthorization } from './pages/app/LiveTradingAuthorization';

import { AdminOverview } from './pages/admin/AdminOverview';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminEmergency } from './pages/admin/AdminEmergency';
import { AdminAudit } from './pages/admin/AdminAudit';
import { AdminJobs } from './pages/admin/AdminJobs';
import { AdminBrokerAccounts } from './pages/admin/AdminBrokerAccounts';
import { AdminBots } from './pages/admin/AdminBots';
import { AdminExecution } from './pages/admin/AdminExecution';
import { AdminCredits } from './pages/admin/AdminCredits';
import { AdminPayments } from './pages/admin/AdminPayments';
import { AdminAiStrategies } from './pages/admin/AdminAiStrategies';
import { AdminMarketData } from './pages/admin/AdminMarketData';
import { AdminRiskControls } from './pages/admin/AdminRiskControls';
import { AdminInfrastructure } from './pages/admin/AdminInfrastructure';
import { AdminSecurity } from './pages/admin/AdminSecurity';


export function App(): JSX.Element {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/ai-trading" element={<AiTrading />} />
            <Route path="/markets" element={<PublicMarkets />} />
            <Route path="/features" element={<Features />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/risk-safety" element={<RiskSafety />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/risk-disclosure" element={<RiskDisclosure />} />
            <Route path="/credit-refund-policy" element={<CreditRefundPolicy />} />
          </Route>

          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="markets" element={<AppMarkets />} />
            <Route path="bots" element={<Bots />} />
            <Route path="bots/new" element={<BotCreate />} />
            <Route path="bots/:id" element={<BotDetail />} />
            <Route path="brokers" element={<Brokers />} />
            <Route path="brokers/new" element={<BrokerAdd />} />
            <Route path="brokers/:id" element={<BrokerDetail />} />
            <Route path="positions" element={<Positions />} />
            <Route path="history" element={<TradeHistory />} />
            <Route path="performance" element={<Performance />} />
            <Route path="wallet" element={<Wallet />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
            <Route path="live-authorization" element={<LiveTradingAuthorization />} />
          </Route>

          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<AdminOverview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="emergency" element={<AdminEmergency />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="jobs" element={<AdminJobs />} />
            <Route path="broker-accounts" element={<AdminBrokerAccounts />} />
            <Route path="bots" element={<AdminBots />} />
            <Route path="execution" element={<AdminExecution />} />
            <Route path="credits" element={<AdminCredits />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="ai-strategies" element={<AdminAiStrategies />} />
            <Route path="market-data" element={<AdminMarketData />} />
            <Route path="risk-controls" element={<AdminRiskControls />} />
            <Route path="infrastructure" element={<AdminInfrastructure />} />
            <Route path="security" element={<AdminSecurity />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}