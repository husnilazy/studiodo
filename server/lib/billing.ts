import { deliverToTenant } from "./emails.js";
import { buildInvoice, invoiceUrl } from "./invoice.js";
import { invoiceMail } from "./invoiceEmail.js";
import crypto from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { billingOrders, kioskKeys, plans, tenantPayments, tenants } from "../db/schema.js";
import { clearLicenseCache, extendKeys, hashKioskKey, syncTenantEndsAt } from "./license.js";
import { logEvent } from "./platformEvents.js";
import { encryptSecret } from "./secretBox.js";
import { fetchMidtransStatus, outcomeFromNotification, type OrderOutcome } from "./midtrans.js";
import { fetchXenditInvoice, outcomeFromInvoice } from "./xenditBilling.js";
import { loadGateway } from "./gateways.js";

type Order = typeof billingOrders.$inferSelect;

const PROVIDER_LABEL: Record<string, string> = { midtrans: "Midtrans", xendit: "Xendit" };

/**
 * Applies a gateway's verdict to a checkout order. Shared by every provider's webhook so the money-handling
 * rules live in exactly one place:
 *  - paid → guarded pending→paid transition; only the first notification wins, so a retried or duplicated
 *    webhook can never extend a booth twice. Everything it causes (booth extensions, new booths, the payment record)
 *    happens in the same database transaction as that transition: a failure half-way undoes the "paid" mark, the
 *    webhook answers with an error, and the gateway retries — a customer is never left paid-but-not-activated.
 *  - failed/expired → only moves an order that is still pending
 * Returns what happened, for the webhook's log line.
 */
/**
 * Emails the invoice for an order to the tenant's registered admin address(es): the "menunggu pembayaran" invoice right
 * after checkout, and the "lunas" receipt once paid (same template, the status decides the wording). Always sent — it is
 * a transactional document, not an optional category. Best-effort and after the money path has committed, so it can
 * never fail a checkout or a payment.
 */
export async function sendInvoiceEmail(orderId: string): Promise<void> {
  try {
    const [order] = await db.select().from(billingOrders).where(eq(billingOrders.id, orderId));
    if (!order) return;
    const view = await buildInvoice(order);
    await deliverToTenant(order.tenantId, invoiceMail(view, invoiceUrl(order.orderId)), view.status === "paid" ? "kuitansi pembayaran" : "invoice langganan");
  } catch (error) {
    console.error("[STUDIODO] invoice gagal dikirim:", error instanceof Error ? error.message : error);
  }
}

export async function settleOrder(order: Order, outcome: OrderOutcome, paymentType: string | null): Promise<"paid" | "duplicate" | "closed" | "ignored"> {
  if (outcome === "paid") {
    const summary = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(billingOrders)
        .set({ status: "paid", paidAt: new Date(), paymentType })
        .where(and(eq(billingOrders.id, order.id), ne(billingOrders.status, "paid")))
        .returning();
      if (!claimed) return null;

      let planSlug: string | null = null;
      if (order.planId) {
        const [plan] = await tx.select({ slug: plans.slug }).from(plans).where(eq(plans.id, order.planId));
        if (plan) {
          planSlug = plan.slug;
          await tx.update(tenants).set({ plan: plan.slug }).where(eq(tenants.id, order.tenantId));
        }
      }

      const existingKeys = await tx.select({ id: kioskKeys.id }).from(kioskKeys)
        .where(and(eq(kioskKeys.tenantId, order.tenantId), isNull(kioskKeys.revokedAt)));
      const activeIds = new Set(existingKeys.map((k) => k.id));

      // Orders made before per-booth licences carry no items: they renewed the whole tenant.
      const items = order.items ?? [];
      const wantedIds = items.length === 0 ? [...activeIds] : items.filter((i) => i.keyId).map((i) => i.keyId as string);
      const renewIds = wantedIds.filter((id) => activeIds.has(id));
      const lostIds = wantedIds.length - renewIds.length;
      await extendKeys(renewIds, order.periodDays, { planSlug, convertTrial: true, tx });

      // Brand-new booths: the key is created now that the money is in, already licensed for the period.
      const newItems = items.filter((i) => !i.keyId);
      const created: string[] = [];
      const endsAt = new Date(Date.now() + order.periodDays * 24 * 60 * 60 * 1000);
      for (const [index, item] of newItems.entries()) {
        const rawKey = crypto.randomBytes(32).toString("hex");
        const label = item.label?.trim() || `Booth ${existingKeys.length + index + 1}`;
        await tx.insert(kioskKeys).values({
          tenantId: order.tenantId, label, keyHash: hashKioskKey(rawKey), rawKey: encryptSecret(rawKey),
          licenseType: "paid", licenseEndsAt: endsAt, licensePlanSlug: planSlug,
        });
        created.push(label);
      }

      const label = PROVIDER_LABEL[order.provider] ?? order.provider;
      await tx.insert(tenantPayments).values({
        tenantId: order.tenantId, planId: order.planId, planName: order.planName, amount: order.amount,
        method: order.provider, periodDays: order.periodDays,
        note: `${label} ${order.orderId}${paymentType ? ` (${paymentType})` : ""} · ${renewIds.length + created.length} booth${order.discountPercent > 0 ? ` · diskon ${order.discountPercent}%` : ""}`,
        recordedBy: order.provider,
      });
      return { renewed: renewIds.length, created, lostIds, providerLabel: label };
    });
    if (!summary) return "duplicate";

    clearLicenseCache();
    await syncTenantEndsAt(order.tenantId);
    const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, order.tenantId));
    logEvent({
      tenantId: order.tenantId, category: "billing", action: "payment.received",
      message: `Pembayaran online Rp ${Number(order.amount).toLocaleString("id-ID")} via ${summary.providerLabel} diterima untuk "${tenant?.name ?? order.tenantId}" (${summary.renewed} booth diperpanjang${summary.created.length ? `, ${summary.created.length} booth baru` : ""}, ${order.periodDays} hari, ${order.planName})`,
      actorType: "system", metadata: { orderId: order.orderId, provider: order.provider, paymentType, booths: order.boothCount },
    });
    if (summary.lostIds > 0) {
      logEvent({
        tenantId: order.tenantId, level: "warning", category: "billing", action: "payment.booth_missing",
        message: `Pembayaran ${order.orderId} mencakup ${summary.lostIds} booth yang sudah dicabut sebelum dibayar — perlu ditindaklanjuti manual (refund atau booth pengganti).`,
        actorType: "system", metadata: { orderId: order.orderId },
      });
    }
    void sendInvoiceEmail(order.id);
    return "paid";
  }

  if (outcome === "failed" || outcome === "expired") {
    const closed = await db.update(billingOrders).set({ status: outcome })
      .where(and(eq(billingOrders.id, order.id), eq(billingOrders.status, "pending"))).returning({ id: billingOrders.id });
    return closed.length > 0 ? "closed" : "ignored";
  }
  return "ignored";
}

/**
 * Asks the gateway what really happened to an order and applies it — the safety net for a webhook that never arrived
 * (server or tunnel down at the moment of payment). Goes through the same settleOrder as the webhooks, with the same
 * amount check, so it can never double-extend or accept a wrong amount. Throws a readable message when the gateway
 * can't be reached or is no longer configured.
 */
export async function reconcileOrder(order: Order): Promise<{ status: Order["status"]; result: "paid" | "duplicate" | "closed" | "ignored" | "waiting" }> {
  if (order.status === "paid") return { status: "paid", result: "duplicate" };
  if (order.provider !== "midtrans" && order.provider !== "xendit") throw new Error("Gateway order ini tidak dikenal");
  const cfg = await loadGateway(order.provider);
  if (!cfg.secretKey) throw new Error(`${PROVIDER_LABEL[order.provider]} belum dikonfigurasi`);

  let outcome: OrderOutcome = "pending";
  let paidAmount: number | null = null;
  let paymentType: string | null = null;
  if (order.provider === "midtrans") {
    const status = await fetchMidtransStatus({ serverKey: cfg.secretKey, production: cfg.environment === "production" }, order.orderId);
    if (!status) return { status: order.status, result: "waiting" };
    outcome = outcomeFromNotification(status);
    paidAmount = Number(status.gross_amount);
    paymentType = status.payment_type ?? null;
  } else {
    if (!order.providerRef) throw new Error("Order Xendit ini tidak punya ID invoice");
    const invoice = await fetchXenditInvoice({ secretKey: cfg.secretKey }, order.providerRef);
    outcome = outcomeFromInvoice(invoice);
    paidAmount = Number(invoice.paid_amount ?? invoice.amount);
    paymentType = invoice.payment_channel ?? invoice.payment_method ?? null;
  }

  if (outcome === "paid" && Math.round(paidAmount ?? NaN) !== Math.round(Number(order.amount))) {
    logEvent({ tenantId: order.tenantId, level: "error", category: "billing", action: "reconcile.amount_mismatch", message: `Pengecekan ulang ${order.orderId}: nominal ${paidAmount} tidak cocok dengan order (${order.amount}) — tidak diproses`, actorType: "system" });
    throw new Error("Nominal pembayaran di gateway tidak cocok dengan order. Hubungi admin STUDIODO.");
  }
  if (outcome === "pending") return { status: order.status, result: "waiting" };
  const result = await settleOrder(order, outcome, paymentType);
  const [fresh] = await db.select({ status: billingOrders.status }).from(billingOrders).where(eq(billingOrders.id, order.id));
  return { status: fresh?.status ?? order.status, result };
}
