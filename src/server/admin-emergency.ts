import { query, withTransaction } from './db';
import { Errors } from './errors';
import { logger } from './logger';

export type EmergencyScope = 'global' | 'symbol' | 'strategy' | 'user' | 'account' | 'broker';
export type EmergencyAction = 'halt_new_entries' | 'halt_all' | 'close_all';

export interface ActivateArgs {
  scope: EmergencyScope;
  scopeId: string | null;
  action: EmergencyAction;
  reason: string;
  activatedBy: string;
}

export async function activateEmergency(args: ActivateArgs): Promise<{ id: string }> {
  const result = await withTransaction(async (client) => {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO emergency_controls (scope, scope_id, action, reason, activated_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [args.scope, args.scopeId, args.action, args.reason, args.activatedBy],
    );
    const controlId = ins.rows[0].id;

    // Pause affected bots
    let pauseSql = '';
    let pauseParams: unknown[] = [];
    if (args.scope === 'global') {
      pauseSql = `UPDATE bots SET state='paused', updated_at=now() WHERE state='running'`;
    } else if (args.scope === 'user') {
      pauseSql = `UPDATE bots SET state='paused', updated_at=now() WHERE state='running' AND user_id=$1`;
      pauseParams = [args.scopeId];
    } else if (args.scope === 'account') {
      pauseSql = `UPDATE bots SET state='paused', updated_at=now() WHERE state='running' AND broker_account_id=$1`;
      pauseParams = [args.scopeId];
    } else if (args.scope === 'broker') {
      pauseSql = `UPDATE bots b SET state='paused', updated_at=now()
                  WHERE b.state='running' AND EXISTS (
                    SELECT 1 FROM broker_accounts ba WHERE ba.id = b.broker_account_id AND ba.broker_name = $1
                  )`;
      pauseParams = [args.scopeId];
    } else if (args.scope === 'strategy') {
      pauseSql = `UPDATE bots b SET state='paused', updated_at=now()
                  WHERE b.state='running' AND EXISTS (
                    SELECT 1 FROM strategy_versions sv WHERE sv.id = b.strategy_version_id AND sv.name = $1
                  )`;
      pauseParams = [args.scopeId];
    }
    if (pauseSql) await client.query(pauseSql, pauseParams);

    await client.query(
      `INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
       VALUES ($1,'admin','emergency.activate','emergency_control',$2,$3)`,
      [args.activatedBy, controlId, JSON.stringify({ scope: args.scope, scopeId: args.scopeId, action: args.action, reason: args.reason })],
    );

    return { id: controlId };
  });

  logger.warn({ controlId: result.id, ...args }, 'Emergency control activated');
  return result;
}

export async function deactivateEmergency(controlId: string, deactivatedBy: string): Promise<void> {
  const upd = await query(
    `UPDATE emergency_controls SET deactivated_at=now(), deactivated_by=$2
      WHERE id=$1 AND deactivated_at IS NULL RETURNING id`,
    [controlId, deactivatedBy],
  );
  if (upd.rows.length === 0) throw Errors.notFound('Active control not found');
  await query(
    `INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id)
     VALUES ($1,'admin','emergency.deactivate','emergency_control',$2)`,
    [deactivatedBy, controlId],
  );
}

export async function listActiveControls(): Promise<Array<{
  id: string; scope: string; scope_id: string | null; action: string;
  reason: string; activated_at: string;
}>> {
  const rows = await query(
    `SELECT id, scope, scope_id, action, reason, activated_at
       FROM emergency_controls WHERE deactivated_at IS NULL
      ORDER BY activated_at DESC`,
  );
  return rows.rows;
}

export async function isHalted(opts: {
  userId: string;
  brokerAccountId: string;
  brokerName: string;
  strategyName: string;
}): Promise<{ halted: boolean; reason?: string }> {
  const rows = await query<{ scope: string; action: string; reason: string }>(
    `SELECT scope, action, reason FROM emergency_controls
      WHERE deactivated_at IS NULL
        AND (
          scope = 'global'
          OR (scope = 'user' AND scope_id = $1::text)
          OR (scope = 'account' AND scope_id = $2::text)
          OR (scope = 'broker' AND scope_id = $3::text)
          OR (scope = 'strategy' AND scope_id = $4::text)
        )
      LIMIT 1`,
    [opts.userId, opts.brokerAccountId, opts.brokerName, opts.strategyName],
  );
  if (rows.rows.length === 0) return { halted: false };
  return { halted: true, reason: `${rows.rows[0].scope}: ${rows.rows[0].reason}` };
}