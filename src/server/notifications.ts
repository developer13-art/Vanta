import nodemailer from 'nodemailer';
import { query } from './db';
import { env } from './env';
import { logger } from './logger';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

export type NotificationCategory = 'trading' | 'broker' | 'wallet' | 'security' | 'system';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export async function createNotification(args: {
  userId: string;
  category: NotificationCategory;
  severity?: NotificationSeverity;
  title: string;
  body: string;
  actionUrl?: string;
  email?: boolean;
}): Promise<string> {
  const res = await query<{ id: string }>(
    `INSERT INTO notifications (user_id, category, severity, title, body, action_url)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [args.userId, args.category, args.severity ?? 'info', args.title, args.body, args.actionUrl ?? null],
  );
  const id = res.rows[0].id;

  if (args.email !== false) {
    // Email is best-effort, never blocks the calling flow.
    sendNotificationEmail(args.userId, args.title, args.body, args.actionUrl).catch((err) =>
      logger.warn({ err, userId: args.userId }, 'Notification email failed'),
    );
  }
  return id;
}

async function sendNotificationEmail(
  userId: string,
  subject: string,
  body: string,
  actionUrl?: string,
): Promise<void> {
  const userRes = await query<{ email: string; full_name: string }>(
    `SELECT email, full_name FROM users WHERE id = $1`,
    [userId],
  );
  const user = userRes.rows[0];
  if (!user) return;

  const link = actionUrl ? `\n\n${env.APP_BASE_URL}${actionUrl}` : '';
  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: user.email,
    subject,
    text: `Hi ${user.full_name},\n\n${body}${link}\n\n— VANTA Trade AI`,
  });
}

export async function sendVerificationEmail(userId: string, token: string): Promise<void> {
  const link = `${env.APP_BASE_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await createNotification({
    userId,
    category: 'security',
    title: 'Verify your email',
    body: `Click to verify your email: ${link}`,
    email: true,
  });
}

export async function sendPasswordResetEmail(userId: string, token: string): Promise<void> {
  const link = `${env.APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await createNotification({
    userId,
    category: 'security',
    title: 'Reset your password',
    body: `Click to reset your password: ${link}`,
    email: true,
  });
}

export async function checkLowBalance(userId: string): Promise<void> {
  const res = await query<{ available_credits: number; lifetime_purchased: number }>(
    `SELECT available_credits, lifetime_purchased FROM wallets WHERE user_id = $1`,
    [userId],
  );
  const w = res.rows[0];
  if (!w || w.lifetime_purchased === 0) return;
  const ratio = w.available_credits / w.lifetime_purchased;
  if (w.available_credits === 0) {
    await createNotification({
      userId,
      category: 'wallet',
      severity: 'critical',
      title: 'Credits depleted',
      body: 'Your credit balance is empty. New trades and AI assessments are blocked. Safety management of open positions continues.',
      actionUrl: '/wallet',
    });
  } else if (ratio <= 0.10) {
    await createNotification({
      userId,
      category: 'wallet',
      severity: 'critical',
      title: 'Credit balance critical',
      body: `Only ${w.available_credits} credits remaining. Top up to keep trading.`,
      actionUrl: '/wallet',
    });
  } else if (ratio <= 0.20) {
    await createNotification({
      userId,
      category: 'wallet',
      severity: 'warning',
      title: 'Low credit balance',
      body: `You have ${w.available_credits} credits remaining.`,
      actionUrl: '/wallet',
    });
  } else if (ratio <= 0.50) {
    await createNotification({
      userId,
      category: 'wallet',
      severity: 'info',
      title: 'Credit balance notice',
      body: `You have ${w.available_credits} credits remaining.`,
      actionUrl: '/wallet',
    });
  }
}