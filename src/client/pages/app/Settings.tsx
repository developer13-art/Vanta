import React, { useEffect, useState } from 'react';
import { api, ApiRequestError } from '../../api';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Input } from '../../components/Input';
import { useToast } from '../../toast-context';
import { useAuth } from '../../auth-context';

interface ProfileSettings {
  full_name: string;
  country: string;
  email: string;
  email_verified_at: string | null;
  mfa_enabled: boolean;
}

type NotificationPreferences = {
  email_trading: boolean;
  email_broker: boolean;
  email_wallet: boolean;
};

const preferenceItems: Array<{ key: keyof NotificationPreferences; title: string; detail: string }> = [
  { key: 'email_trading', title: 'Trading updates', detail: 'Position activity and trade execution notices' },
  { key: 'email_broker', title: 'Broker account alerts', detail: 'Connection and account health updates' },
  { key: 'email_wallet', title: 'Wallet updates', detail: 'Credit balance and payment notices' },
];

export function Settings(): JSX.Element {
  const toast = useToast();
  const { refreshMe } = useAuth();
  const [profile, setProfile] = useState<ProfileSettings | null>(null);
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    email_trading: true,
    email_broker: true,
    email_wallet: true,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadSettings = () => {
    setLoading(true);
    setLoadError(null);
    setPreferencesLoaded(false);
    Promise.allSettled([api.getProfile(), api.notificationPreferences()])
      .then(([profileResult, preferencesResult]) => {
        const failures: string[] = [];
        if (profileResult.status === 'fulfilled') {
          setProfile({
            full_name: profileResult.value.full_name,
            country: profileResult.value.country,
            email: profileResult.value.email,
            email_verified_at: profileResult.value.email_verified_at,
            mfa_enabled: profileResult.value.mfa_enabled,
          });
        } else {
          failures.push('profile');
        }
        if (preferencesResult.status === 'fulfilled') {
          setPreferencesLoaded(true);
          setPrefs({
            email_trading: preferencesResult.value.email_trading,
            email_broker: preferencesResult.value.email_broker,
            email_wallet: preferencesResult.value.email_wallet,
          });
        } else {
          failures.push('notification preferences');
        }
        if (failures.length) setLoadError(`Could not load ${failures.join(' and ')}. Retry to view the latest settings.`);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadSettings(); }, []);

  const saveProfile = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      await api.updateProfile({ fullName: profile.full_name.trim(), country: profile.country.trim().toUpperCase() });
      await refreshMe();
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'Profile update failed');
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (passwords.newPass !== passwords.confirm) {
      toast.error('The new passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(passwords.current, passwords.newPass);
      toast.success('Password updated');
      setPasswords({ current: '', newPass: '', confirm: '' });
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'Password change failed');
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = async () => {
    setBusy(true);
    try {
      await api.updateNotificationPreferences(prefs);
      toast.success('Email preferences saved');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'Preference update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-page">
      <header className="settings-heading">
        <div className="settings-title-wrap">
          <span className="settings-title-icon"><Icon name="settings" size={23} /></span>
          <div><span className="settings-eyebrow">ACCOUNT & PREFERENCES</span><h1>Settings</h1><p>Manage your profile, email updates, and account security.</p></div>
        </div>
        <span className="settings-heading-note"><Icon name="shield" size={15} /> Private account settings</span>
      </header>

      <nav className="settings-tabs" aria-label="Settings sections">
        <a href="#profile"><Icon name="dashboard" size={15} /> Profile</a>
        <a href="#notifications"><Icon name="notifications" size={15} /> Notifications</a>
        <a href="#security"><Icon name="shield" size={15} /> Security</a>
      </nav>

      {loadError && <div className="settings-alert" role="status">{loadError}<button type="button" onClick={loadSettings}>Retry</button></div>}
      {loading ? (
        <div className="settings-loading"><span className="dashboard-spinner" /> Loading account settings…</div>
      ) : (
        <div className="settings-grid">
          <section className="settings-card" id="profile">
            <div className="settings-card-heading">
              <span className="settings-card-icon settings-icon-blue"><Icon name="dashboard" size={19} /></span>
              <div><h2>Profile</h2><p>Your account identity and region</p></div>
            </div>
            {profile ? (
              <>
                <Input label="Email address" type="email" value={profile.email} disabled />
                <Input label="Full name" autoComplete="name" value={profile.full_name} onChange={(event) => setProfile({ ...profile, full_name: event.target.value })} />
                <Input label="Country code" maxLength={2} placeholder="US" value={profile.country} onChange={(event) => setProfile({ ...profile, country: event.target.value.toUpperCase() })} />
                <div className="settings-card-footer"><span>Email address is managed through account verification.</span><Button onClick={saveProfile} loading={busy} disabled={!profile.full_name.trim() || !profile.country.trim()}>Save profile</Button></div>
              </>
            ) : <p className="settings-unavailable">Profile details are unavailable. Use Retry to load them again.</p>}
          </section>

          <section className="settings-card settings-preferences-card" id="notifications">
            <div className="settings-card-heading">
              <span className="settings-card-icon settings-icon-gold"><Icon name="notifications" size={19} /></span>
              <div><h2>Email notifications</h2><p>Choose which account events are emailed to you</p></div>
            </div>
            <div className="settings-preference-list">
              {preferenceItems.map((item) => (
                <label className="settings-preference-row" key={item.key}>
                  <span className="settings-preference-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                  <input type="checkbox" checked={prefs[item.key]} onChange={(event) => setPrefs({ ...prefs, [item.key]: event.target.checked })} disabled={loading || !preferencesLoaded} />
                </label>
              ))}
            </div>
            <div className="settings-card-footer"><span>In-app notifications are managed separately.</span><Button onClick={savePrefs} loading={busy} disabled={!preferencesLoaded}>Save preferences</Button></div>
          </section>

          <section className="settings-card settings-security-card" id="security">
            <div className="settings-card-heading">
              <span className="settings-card-icon settings-icon-green"><Icon name="shield" size={19} /></span>
              <div><h2>Account security</h2><p>Review your sign-in protection</p></div>
            </div>
            <div className="settings-security-status">
              <div><span>Email verification</span><strong className={profile ? profile.email_verified_at ? 'settings-status-on' : 'settings-status-pending' : ''}><i />{profile ? profile.email_verified_at ? 'Verified' : 'Not verified' : 'Unavailable'}</strong></div>
              <div><span>Multi-factor authentication</span><strong className={profile ? profile.mfa_enabled ? 'settings-status-on' : 'settings-status-pending' : ''}><i />{profile ? profile.mfa_enabled ? 'Enabled' : 'Not enabled' : 'Unavailable'}</strong></div>
            </div>
            {!profile?.mfa_enabled && <p className="settings-security-note">Multi-factor setup is not available in this settings flow.</p>}
          </section>

          <section className="settings-card settings-password-card">
            <div className="settings-card-heading">
              <span className="settings-card-icon settings-icon-red"><Icon name="shield" size={19} /></span>
              <div><h2>Change password</h2><p>Use a unique password with at least 10 characters</p></div>
            </div>
            <Input label="Current password" type="password" autoComplete="current-password" value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} />
            <div className="settings-password-row">
              <Input label="New password" type="password" autoComplete="new-password" minLength={10} value={passwords.newPass} onChange={(event) => setPasswords({ ...passwords, newPass: event.target.value })} />
              <Input label="Confirm new password" type="password" autoComplete="new-password" minLength={10} value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} />
            </div>
            <div className="settings-card-footer"><span>Changing your password does not disconnect broker accounts.</span><Button onClick={changePassword} loading={busy} disabled={!passwords.current || passwords.newPass.length < 10 || passwords.newPass !== passwords.confirm}>Update password</Button></div>
          </section>
        </div>
      )}
    </div>
  );
}
