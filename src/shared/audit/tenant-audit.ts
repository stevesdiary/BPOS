/**
 * Writes to the merchant's own activity trail (tenant schema `audit_log`).
 *
 * Distinct from modules/platform/audit — that one is the platform's internal
 * record, this one is what the merchant sees in their settings. Platform staff
 * access is written to BOTH: internally for compliance, and here so the
 * merchant can always see who from BPOS looked at their business and why.
 */

import { v4 as uuidv4 } from 'uuid';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { withTenantSchema } from '../db/tenant.js';
import { auditLog } from '../db/schema/tenant.js';

export type AuditActorType = 'user' | 'platform' | 'system';

export interface TenantAuditInput {
  actorType: AuditActorType;
  actorId?: string;
  actorEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Record an entry on the merchant's trail.
 *
 * Never throws into the caller's path: failing to log must not roll back the
 * action the operator believes succeeded. It is loud in the logs instead.
 */
export async function writeTenantAudit(schemaName: string, input: TenantAuditInput): Promise<void> {
  try {
    await withTenantSchema(schemaName, async (db) => {
      await db.insert(auditLog).values({
        id: uuidv4(),
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        reason: input.reason ?? null,
        metadata: input.metadata ?? null,
      });
    });
  } catch (err) {
    console.error('TENANT AUDIT WRITE FAILED', {
      schemaName,
      action: input.action,
      actorId: input.actorId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface TenantAuditQuery {
  actorType?: AuditActorType;
  action?: string;
  page: number;
  limit: number;
}

export async function listTenantAudit(schemaName: string, query: TenantAuditQuery) {
  return withTenantSchema(schemaName, async (db) => {
    const filters: SQL[] = [];
    if (query.actorType) filters.push(eq(auditLog.actorType, query.actorType));
    if (query.action) filters.push(eq(auditLog.action, query.action));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const items = await db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    const [counted] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(where);

    return { items, total: counted?.count ?? 0 };
  });
}
