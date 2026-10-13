import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, tenants } from "../db/schema.js";
import { createNotification } from "./notifications.js";
import { logEvent } from "./platformEvents.js";
import { accountLockedMail, sendMail } from "./mailer.js";
import type { LockoutInfo } from "./loginGuard.js";

// What happens when a login lockout starts: it is written to the activity log with the owner's contact details (so the
// Superadmin can follow up on WhatsApp straight from "Peringatan keamanan"), the tenant sees a notification in their
// dashboard bell, and the account's email gets a notice. All best-effort: none of it may break the login response.

export const LOCKOUT_ACTION = "login.lockout";

export async function onTenantLoginLockout(email: string, ip: string, info: LockoutInfo) {
  try {
    const [row] = await db.select({
      tenantId: tenants.id, tenantName: tenants.name, ownerName: tenants.ownerName, ownerWhatsapp: tenants.ownerWhatsapp,
    }).from(admins).innerJoin(tenants, eq(tenants.id, admins.tenantId)).where(eq(admins.email, email));

    const lockMinutes = Math.round(info.lockMs / 60_000);
    // An email that matches no account is still worth a log line (someone is guessing), but there is nobody to contact.
    logEvent({
      tenantId: row?.tenantId ?? null,
      level: "warning",
      category: "auth",
      action: LOCKOUT_ACTION,
      message: row
        ? `Login ${row.tenantName} dikunci ${lockMinutes} menit setelah kata sandi salah beruntun (kunci ke-${info.lockoutCount})`
        : `Login untuk email tak dikenal "${email}" dikunci ${lockMinutes} menit (kunci ke-${info.lockoutCount})`,
      actorType: "system",
      actorLabel: email,
      metadata: {
        email, ip, lockMinutes, lockoutCount: info.lockoutCount,
        tenantName: row?.tenantName ?? null, ownerName: row?.ownerName ?? null, ownerWhatsapp: row?.ownerWhatsapp ?? null,
      },
    });
    if (!row) return;

    await createNotification({
      tenantId: row.tenantId, kind: "system", severity: "warning",
      title: "Percobaan masuk gagal beruntun",
      body: `Login akun ${email} dikunci ${lockMinutes} menit karena kata sandi salah berulang kali. Jika itu bukan Anda, segera ganti kata sandi atau hubungi STUDIODO.`,
      linkUrl: "/portal/akun", createdBy: "system",
    });
    const mail = await sendMail({ to: email, ...accountLockedMail({ ownerName: row.ownerName, lockMinutes }) });
    if (!mail.sent && mail.reason !== "not_configured") {
      logEvent({ tenantId: row.tenantId, level: "warning", category: "system", action: "email.failed", message: `Email peringatan keamanan ke ${email} gagal: ${mail.detail ?? mail.reason}`, actorType: "system" });
    }
  } catch (error) {
    console.error("[STUDIODO] gagal memproses peringatan keamanan:", error instanceof Error ? error.message : error);
  }
}
