import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { billingOrders, plans, tenantPayments, tenants } from "../db/schema.js";
import { extendSubscription } from "./subscription.js";
import { syncTenantFeaturesToPlan } from "./planFeatures.js";
import { logEvent } from "./platformEvents.js";
import type { OrderOutcome } from "./midtrans.js";

type Order = typeof billingOrders.$inferSelect;

const PROVIDER_LABEL: Record<string, string> = { midtrans: "Midtrans", xendit: "Xendit" };

/**
 * Applies a gateway's verdict to a checkout order. Shared by every provider's webhook so the money-handling
 * rules live in exactly one place:
 *  - paid → guarded pending→paid transition; only the first notification wins, so a retried or duplicated
 *    webhook can never extend the subscription twice; then plan switch + extension + payment record
 *  - failed/expired → only moves an order that is still pending
 * Returns what happened, for the webhook's log line.
 */
export async function settleOrder(order: Order, outcome: OrderOutcome, paymentType: string | null): Promise<"paid" | "duplicate" | "closed" | "ignored"> {
  if (outcome === "paid") {
    const [claimed] = await db.update(billingOrders)
      .set({ status: "paid", paidAt: new Date(), paymentType })
      .where(and(eq(billingOrders.id, order.id), ne(billingOrders.status, "paid")))
      .returning();
    if (!claimed) return "duplicate";

    if (order.planId) {
      const [plan] = await db.select({ slug: plans.slug }).from(plans).where(eq(plans.id, order.planId));
      if (plan) {
        await db.update(tenants).set({ plan: plan.slug }).where(eq(tenants.id, order.tenantId));
        await syncTenantFeaturesToPlan(order.tenantId);
      }
    }
    const tenant = await extendSubscription(order.tenantId, order.periodDays);
    const label = PROVIDER_LABEL[order.provider] ?? order.provider;
    await db.insert(tenantPayments).values({
      tenantId: order.tenantId, planId: order.planId, planName: order.planName, amount: order.amount,
      method: order.provider, periodDays: order.periodDays, note: `${label} ${order.orderId}${paymentType ? ` (${paymentType})` : ""}`, recordedBy: order.provider,
    });
    logEvent({
      tenantId: order.tenantId, category: "billing", action: "payment.received",
      message: `Pembayaran online Rp ${Number(order.amount).toLocaleString("id-ID")} via ${label} diterima untuk "${tenant?.name ?? order.tenantId}" (${order.periodDays} hari, ${order.planName})`,
      actorType: "system", metadata: { orderId: order.orderId, provider: order.provider, paymentType },
    });
    return "paid";
  }

  if (outcome === "failed" || outcome === "expired") {
    const closed = await db.update(billingOrders).set({ status: outcome })
      .where(and(eq(billingOrders.id, order.id), eq(billingOrders.status, "pending"))).returning({ id: billingOrders.id });
    return closed.length > 0 ? "closed" : "ignored";
  }
  return "ignored";
}
