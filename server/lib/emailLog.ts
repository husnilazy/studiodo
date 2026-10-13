import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { emailLog, tenants } from "../db/schema.js";
import { mailConfigured } from "./mailer.js";

const DAY = 86_400_000;
export const EMAIL_LOG_RETENTION_DAYS = 90;

/** Delete log rows older than the retention window. Best-effort; runs with the 30-minute background job. */
export async function pruneEmailLog(now = Date.now()): Promise<number> {
  try {
    const rows = await db.delete(emailLog).where(lt(emailLog.createdAt, new Date(now - EMAIL_LOG_RETENTION_DAYS * DAY))).returning({ id: emailLog.id });
    return rows.length;
  } catch {
    return 0;
  }
}

export async function emailLogSummary(now = Date.now()) {
  const since = new Date(now - 7 * DAY);
  const rows = await db.select({ status: emailLog.status, n: count() }).from(emailLog).where(gte(emailLog.createdAt, since)).groupBy(emailLog.status);
  const by = (s: string) => Number(rows.find((r) => r.status === s)?.n ?? 0);
  return { configured: mailConfigured(), from: process.env.MAIL_FROM || "STUDIODO <no-reply@studiodo.id>", last7Days: { sent: by("sent"), failed: by("failed"), skipped: by("skipped") } };
}

export async function listEmailLog(opts: { status?: string; q?: string; limit?: number }) {
  const filters = [];
  if (opts.status === "sent" || opts.status === "failed" || opts.status === "skipped") filters.push(eq(emailLog.status, opts.status));
  if (opts.q) filters.push(sql`(${emailLog.toEmail} ilike ${`%${opts.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`} or ${emailLog.subject} ilike ${`%${opts.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`})`);
  return db.select({
    id: emailLog.id, toEmail: emailLog.toEmail, subject: emailLog.subject, kind: emailLog.kind, status: emailLog.status, error: emailLog.error, createdAt: emailLog.createdAt,
    tenantId: emailLog.tenantId, tenantName: tenants.name,
  }).from(emailLog).leftJoin(tenants, eq(tenants.id, emailLog.tenantId))
    .where(filters.length ? and(...filters) : undefined).orderBy(desc(emailLog.createdAt)).limit(Math.min(200, Math.max(1, opts.limit ?? 100)));
}
