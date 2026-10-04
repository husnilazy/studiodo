import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

// A kiosk creates its session row as soon as the payment screen opens, BEFORE the customer has chosen how to pay.
// Anything that interrupts that moment (the customer walks away, the screen is re-opened, an old build created two rows)
// leaves a "pending" session behind that nobody will ever pay. Those used to sit in the dashboard's payment log as
// "PENDING" forever, right next to the session that actually succeeded. They are closed out here instead.

/** Closes sessions that can no longer be paid: never got a QRIS invoice within 5 min, or an invoice nobody paid in 30 min. */
export async function expireStalePendingSessions(tenantId: string) {
  await db.execute(sql`
    update sessions set payment_status = 'expired'
    where tenant_id = ${tenantId}
      and payment_status = 'pending'
      and payment_purpose = 'session'
      and (
        (xendit_invoice_id is null and created_at < now() - interval '5 minutes')
        or created_at < now() - interval '30 minutes'
      )
  `);
}

/**
 * Called the moment a session is paid. Other unpaid sessions of the same booth created within two minutes of it that
 * never reached a QRIS invoice are the leftovers of the same customer's visit (double-created or abandoned), so they
 * are closed immediately instead of lingering as "pending".
 */
export async function expireSiblingPendingSessions(tenantId: string, paidSessionId: string) {
  await db.execute(sql`
    update sessions set payment_status = 'expired'
    where tenant_id = ${tenantId}
      and id <> ${paidSessionId}
      and payment_status = 'pending'
      and payment_purpose = 'session'
      and xendit_invoice_id is null
      and abs(extract(epoch from (created_at - (select created_at from sessions where id = ${paidSessionId})))) < 120
  `);
}
