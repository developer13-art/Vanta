import { query, withTransaction } from './db';
import { logger } from './logger';
import { env } from './env';

export type JobType =
  | 'tick_analysis'
  | 'position_check'
  | 'reconciliation'
  | 'reservation_expiry'
  | 'notification_dispatch'
  | 'broker_health_check';

export interface JobRow {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

type Handler = (payload: Record<string, unknown>) => Promise<void>;

const handlers: Partial<Record<JobType, Handler>> = {};

export function registerHandler(type: JobType, handler: Handler): void {
  handlers[type] = handler;
}

export async function enqueue(
  type: JobType,
  payload: Record<string, unknown>,
  opts?: { runAt?: Date; maxAttempts?: number },
): Promise<string> {
  const res = await query<{ id: string }>(
    `INSERT INTO jobs (type, payload, run_at, max_attempts)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [
      type,
      JSON.stringify(payload),
      opts?.runAt ?? new Date(),
      opts?.maxAttempts ?? 3,
    ],
  );
  return res.rows[0].id;
}

async function claimOne(): Promise<JobRow | null> {
  return withTransaction(async (client) => {
    const res = await client.query<JobRow>(
      `UPDATE jobs
          SET status = 'running', claimed_at = now(), attempts = attempts + 1
        WHERE id = (
          SELECT id FROM jobs
           WHERE status = 'pending' AND run_at <= now()
           ORDER BY run_at
           LIMIT 1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING id, type, payload, attempts, max_attempts`,
    );
    return res.rows[0] ?? null;
  });
}

async function markDone(jobId: string): Promise<void> {
  await query(
    `UPDATE jobs SET status = 'done', completed_at = now() WHERE id = $1`,
    [jobId],
  );
}

async function markFailed(job: JobRow, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  if (job.attempts >= job.max_attempts) {
    await query(
      `UPDATE jobs SET status = 'failed', completed_at = now(), last_error = $2 WHERE id = $1`,
      [job.id, message.slice(0, 2000)],
    );
  } else {
    const backoffSeconds = Math.min(300, 5 * Math.pow(2, job.attempts));
    await query(
      `UPDATE jobs
          SET status = 'pending',
              run_at = now() + ($2 || ' seconds')::interval,
              last_error = $3
        WHERE id = $1`,
      [job.id, backoffSeconds, message.slice(0, 2000)],
    );
  }
}

let running = false;

export async function drainOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (let i = 0; i < env.JOB_BATCH_SIZE; i++) {
      const job = await claimOne();
      if (!job) break;
      const handler = handlers[job.type];
      if (!handler) {
        logger.error({ jobId: job.id, type: job.type }, 'No handler registered');
        await markFailed(job, new Error(`No handler for ${job.type}`));
        continue;
      }
      try {
        await handler(job.payload);
        await markDone(job.id);
      } catch (err) {
        logger.warn({ err, jobId: job.id, type: job.type }, 'Job failed');
        await markFailed(job, err);
      }
    }
  } finally {
    running = false;
  }
}

let timer: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    drainOnce().catch((err) => logger.error({ err }, 'Scheduler drain error'));
  }, env.JOB_POLL_INTERVAL_MS);
  timer.unref();
  logger.info({ intervalMs: env.JOB_POLL_INTERVAL_MS }, 'Job scheduler started');
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// Recover stale 'running' jobs on startup (in case process died mid-job).
export async function recoverStaleJobs(): Promise<void> {
  await query(
    `UPDATE jobs
        SET status = 'pending', claimed_at = NULL
      WHERE status = 'running'
        AND claimed_at < now() - interval '2 minutes'`,
  );
}