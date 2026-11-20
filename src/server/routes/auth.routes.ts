import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../db';
import { Errors } from '../errors';
import {
  hashPassword, verifyPassword, signAccessToken, signRefreshToken,
  refreshTokenExpiryDate, verifyRefreshToken,
} from '../auth';
import { randomToken, sha256Hex } from '../crypto';
import {
  signupSchema, loginSchema, verifyEmailSchema, forgotPasswordSchema,
  resetPasswordSchema, changePasswordSchema,
} from '../schema';
import { validateBody, requireAuth, authRateLimit } from '../middleware';
import { sendVerificationEmail, sendPasswordResetEmail, createNotification } from '../notifications';
import { env } from '../env';

export const authRouter = Router();

authRouter.post('/signup', authRateLimit, validateBody(signupSchema), async (req, res, next) => {
  try {
    const { fullName, email, password, country } = req.body as typeof signupSchema._type;
    const existing = await query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (existing.rows.length > 0) throw Errors.conflict('Email already registered');

    const passwordHash = await hashPassword(password);
    const result = await withTransaction(async (client) => {
      const u = await client.query<{ id: string }>(
        `INSERT INTO users
           (email, password_hash, full_name, country, terms_accepted_at, risk_accepted_at)
         VALUES ($1,$2,$3,$4, now(), now()) RETURNING id`,
        [email, passwordHash, fullName, country],
      );
      const userId = u.rows[0].id;
      await client.query(
        `INSERT INTO wallets (user_id) VALUES ($1)`,
        [userId],
      );
      await client.query(
        `INSERT INTO notification_preferences (user_id) VALUES ($1)`,
        [userId],
      );
      return userId;
    });

    const verifyToken = randomToken(32);
    await query(
      `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
       VALUES ($1,$2,'verify_email', now() + interval '24 hours')`,
      [result, sha256Hex(verifyToken)],
    );
    await sendVerificationEmail(result, verifyToken);

    const accessToken = signAccessToken(result, []);
    res.status(201).json({ userId: result, accessToken });
  } catch (err) { next(err); }
});

authRouter.post('/login', authRateLimit, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as typeof loginSchema._type;
    const userRes = await query<{
      id: string; password_hash: string; email_verified_at: string | null;
      mfa_enabled: boolean; status: string;
    }>(
      `SELECT id, password_hash, email_verified_at, mfa_enabled, status FROM users WHERE email = $1`,
      [email],
    );
    const user = userRes.rows[0];

    // Log the attempt regardless of outcome
    const ip = req.ip;
    const ua = req.header('user-agent') ?? null;

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      if (user) {
        await query(
          `INSERT INTO login_events (user_id, ip_address, user_agent, success, reason)
           VALUES ($1,$2,$3,false,'bad_password')`,
          [user.id, ip, ua],
        );
      }
      throw Errors.unauthorized('Invalid credentials');
    }
    if (user.status !== 'active') throw Errors.forbidden('Account is not active');
    if (user.mfa_enabled) throw Errors.forbidden('MFA required — use /mfa/challenge');

    await query(
      `INSERT INTO login_events (user_id, ip_address, user_agent, success)
       VALUES ($1,$2,$3,true)`,
      [user.id, ip, ua],
    );

    const roles: string[] = [];
    const adminCheck = await query(`SELECT role FROM admin_users WHERE user_id = $1`, [user.id]);
    if (adminCheck.rows.length > 0) roles.push('admin', adminCheck.rows[0].role);

    const jti = randomUUID();
    const refreshToken = signRefreshToken(user.id, jti);
    await query(
      `INSERT INTO refresh_tokens
         (user_id, token_hash, device_label, ip_address, user_agent, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [user.id, sha256Hex(refreshToken), ua?.slice(0, 120) ?? null, ip, ua, refreshTokenExpiryDate()],
    );

    const accessToken = signAccessToken(user.id, roles);
    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, emailVerified: !!user.email_verified_at, roles },
    });
  } catch (err) { next(err); }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) throw Errors.badRequest('Missing refresh token');
    const payload = verifyRefreshToken(refreshToken);

    const stored = await query<{ id: string; user_id: string; revoked_at: string | null; expires_at: string }>(
      `SELECT id, user_id, revoked_at, expires_at FROM refresh_tokens
        WHERE token_hash = $1 AND user_id = $2`,
      [sha256Hex(refreshToken), payload.sub],
    );
    const row = stored.rows[0];
    if (!row || row.revoked_at || new Date(row.expires_at) < new Date())
      throw Errors.unauthorized('Refresh token invalid');

    // Rotate: revoke old, issue new
    await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [row.id]);

    const roles: string[] = [];
    const adminCheck = await query(`SELECT role FROM admin_users WHERE user_id = $1`, [row.user_id]);
    if (adminCheck.rows.length > 0) roles.push('admin', adminCheck.rows[0].role);

    const jti = randomUUID();
    const newRefresh = signRefreshToken(row.user_id, jti);
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1,$2,$3)`,
      [row.user_id, sha256Hex(newRefresh), refreshTokenExpiryDate()],
    );

    res.json({ accessToken: signAccessToken(row.user_id, roles), refreshToken: newRefresh });
  } catch (err) { next(err); }
});

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      await query(`UPDATE refresh_tokens SET revoked_at=now() WHERE token_hash=$1 AND user_id=$2`, [
        sha256Hex(refreshToken), req.userId,
      ]);
    }
    res.status(204).end();
  } catch (err) { next(err); }
});

authRouter.post('/verify-email', validateBody(verifyEmailSchema), async (req, res, next) => {
  try {
    const { token } = req.body as typeof verifyEmailSchema._type;
    const hash = sha256Hex(token);
    const found = await query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM auth_tokens
        WHERE token_hash = $1 AND purpose = 'verify_email'
          AND consumed_at IS NULL AND expires_at > now()`,
      [hash],
    );
    const row = found.rows[0];
    if (!row) throw Errors.badRequest('Invalid or expired token');

    await withTransaction(async (client) => {
      await client.query(`UPDATE auth_tokens SET consumed_at = now() WHERE id = $1`, [row.id]);
      await client.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [row.user_id]);
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

authRouter.post('/forgot-password', authRateLimit, validateBody(forgotPasswordSchema), async (req, res, next) => {
  try {
    const { email } = req.body as typeof forgotPasswordSchema._type;
    const userRes = await query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
    if (userRes.rows[0]) {
      const token = randomToken(32);
      await query(
        `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1,$2,'reset_password', now() + interval '1 hour')`,
        [userRes.rows[0].id, sha256Hex(token)],
      );
      await sendPasswordResetEmail(userRes.rows[0].id, token);
    }
    // Always return 200 to avoid email enumeration
    res.json({ ok: true });
  } catch (err) { next(err); }
});

authRouter.post('/reset-password', validateBody(resetPasswordSchema), async (req, res, next) => {
  try {
    const { token, newPassword } = req.body as typeof resetPasswordSchema._type;
    const hash = sha256Hex(token);
    const found = await query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM auth_tokens
        WHERE token_hash = $1 AND purpose = 'reset_password'
          AND consumed_at IS NULL AND expires_at > now()`,
      [hash],
    );
    const row = found.rows[0];
    if (!row) throw Errors.badRequest('Invalid or expired reset token');

    const passwordHash = await hashPassword(newPassword);
    await withTransaction(async (client) => {
      await client.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [row.user_id, passwordHash]);
      await client.query(`UPDATE auth_tokens SET consumed_at = now() WHERE id = $1`, [row.id]);
      await client.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [row.user_id]);
    });
    await createNotification({
      userId: row.user_id, category: 'security', severity: 'warning',
      title: 'Password changed', body: 'Your password was reset. If this was not you, contact support immediately.',
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

authRouter.post('/change-password', requireAuth, validateBody(changePasswordSchema), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body as typeof changePasswordSchema._type;
    const userRes = await query<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id=$1`, [req.userId]);
    if (!userRes.rows[0] || !(await verifyPassword(currentPassword, userRes.rows[0].password_hash)))
      throw Errors.unauthorized('Current password incorrect');
    const hash = await hashPassword(newPassword);
    await query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [req.userId, hash]);
    await createNotification({
      userId: req.userId!, category: 'security', severity: 'warning',
      title: 'Password changed', body: 'Your password was updated.',
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const userRes = await query<{
      id: string; email: string; full_name: string; country: string;
      email_verified_at: string | null; mfa_enabled: boolean; created_at: string;
    }>(`SELECT id, email, full_name, country, email_verified_at, mfa_enabled, created_at FROM users WHERE id=$1`, [req.userId]);
    if (!userRes.rows[0]) throw Errors.notFound();
    res.json(userRes.rows[0]);
  } catch (err) { next(err); }
});

authRouter.get('/sessions', requireAuth, async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, device_label, ip_address, user_agent, created_at, expires_at, revoked_at
         FROM refresh_tokens WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.userId],
    );
    res.json(rows.rows);
  } catch (err) { next(err); }
});