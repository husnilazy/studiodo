import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { leadTasks, tenantApplications } from "../db/schema.js";
import { logEvent } from "./platformEvents.js";

// Reminders for follow-up tasks. The existing notification system (lib/notifications.ts) delivers to *tenants*, not to the
// platform team, so reminders go where the team already looks: the Superadmin "Aktivitas & Error" feed (platform_events),
// plus the badge on the Calon Tenant menu (GET /superadmin/leads/summary). Each due task raises ONE reminder: the row is
// claimed by stamping reminded_at, so overlapping runs or a restart cannot duplicate it.

export async function runLeadReminders(now: Date = new Date()): Promise<number> {
  const due = await db.select({ id: leadTasks.id, title: leadTasks.title, leadId: leadTasks.leadId, businessName: tenantApplications.businessName })
    .from(leadTasks)
    .innerJoin(tenantApplications, eq(leadTasks.leadId, tenantApplications.id))
    .where(and(isNull(leadTasks.doneAt), isNull(leadTasks.remindedAt), lte(leadTasks.dueAt, now)))
    .limit(100);
  let raised = 0;
  for (const task of due) {
    const [claimed] = await db.update(leadTasks).set({ remindedAt: now })
      .where(and(eq(leadTasks.id, task.id), isNull(leadTasks.remindedAt))).returning({ id: leadTasks.id });
    if (!claimed) continue;
    raised++;
    logEvent({
      level: "warning", category: "tenant", action: "lead.followup_due",
      message: `Follow-up jatuh tempo: ${task.title} — ${task.businessName}`,
      actorType: "system", metadata: { leadId: task.leadId, taskId: task.id },
    });
  }
  return raised;
}
