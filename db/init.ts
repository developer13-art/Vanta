import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

async function initializeDatabase(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required. Set it in .env or the process environment.');
  }

  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query(schema);
    console.log('Database schema initialized successfully.');
  } finally {
    await client.end();
  }
}

initializeDatabase().catch((error: unknown) => {
  console.error('Database initialization failed:', error);
  process.exitCode = 1;
});
