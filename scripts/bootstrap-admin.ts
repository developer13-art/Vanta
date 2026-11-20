import 'dotenv/config';
import { Client } from 'pg';
import { emailSchema } from '../src/server/schema';

async function bootstrapAdmin(): Promise<void> {
  const parsedEmail = emailSchema.safeParse(process.argv[2]);
  if (!parsedEmail.success) {
    throw new Error('Usage: npm run admin:bootstrap -- <verified-user-email>');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock(19777, 1)');

      const admins = await client.query('SELECT 1 FROM admin_users LIMIT 1');
      if (admins.rowCount) {
        throw new Error('An admin already exists. This command only bootstraps the first admin.');
      }

      const users = await client.query<{
        id: string;
        status: string;
        email_verified_at: Date | null;
      }>(
        `SELECT id, status, email_verified_at
           FROM users
          WHERE email = $1`,
        [parsedEmail.data],
      );
      const user = users.rows[0];
      if (!user) throw new Error('No account found for that email. Sign up first.');
      if (user.status !== 'active') throw new Error('The account must be active.');
      if (!user.email_verified_at) throw new Error('Verify the account email before bootstrapping admin access.');

      await client.query(
        `INSERT INTO admin_users (user_id, role)
         VALUES ($1, 'super_admin')`,
        [user.id],
      );
      await client.query(
        `INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
         VALUES ($1, 'admin', 'admin.bootstrap', 'admin_user', $1, $2)`,
        [user.id, JSON.stringify({ role: 'super_admin' })],
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }

  console.log(`First super-admin access enabled for ${parsedEmail.data}. Log out and back in to refresh your role.`);
}

bootstrapAdmin().catch((error: unknown) => {
  console.error('Admin bootstrap failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
