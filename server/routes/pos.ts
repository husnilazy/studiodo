import { Router, type Response } from "express";
import crypto from "node:crypto";
import { and, asc, desc, eq, gte, inArray, like, lt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { kioskKeys, packages, templates, posOrders, posProducts, posQueueTickets, posRefunds, posSettings, posShifts, vouchers, type PosOrderItem } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { hashPassword, verifyPassword } from "../lib/passwordHash.js";
import {
  CUSTOM_FRAME_CATEGORY, PosError, computeTotals, customFrameOf, expectedCash, kioskPortionOf, orderNumber, pickNextTicket, priceCart, queueLabel,
  refundAmount, refundStatus, settlePayment, wibDay, type Catalog, type CartLine, type RefundLine,
} from "../lib/pos.js";
import { resolveFrameUrl } from "../lib/frameUrl.js";

// POS / Kasir API (tenant-admin auth, mounted at /api/pos). Every query is scoped to req.tenantId.

export const posRouter = Router();
posRouter.use(requireAdminAuth);

const UUID = /^[0-9a-f-]{36}$/i;
const num = (v: unknown) => Number(v ?? 0);
const DAY_MS = 86_400_000;
const startOfWibDay = (day: string) => new Date(`${day}T00:00:00+07:00`);

function fail(res: Response, error: unknown) {
  if (error instanceof PosError) return res.status(error.status).json({ error: error.message });
  console.error("[pos]", error);
  return res.status(500).json({ error: "Terjadi kesalahan di server kasir" });
}
const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505" || /unique|duplicate/i.test(String((e as Error)?.message ?? ""));

async function openShift(tenantId: string) {
  const [shift] = await db.select().from(posShifts).where(and(eq(posShifts.tenantId, tenantId), sql`${posShifts.closedAt} is null`)).orderBy(desc(posShifts.openedAt)).limit(1);
  return shift ?? null;
}

async function getSettings(tenantId: string) {
  const [row] = await db.select().from(posSettings).where(eq(posSettings.tenantId, tenantId));
  return { receiptHeader: row?.receiptHeader ?? "", receiptFooter: row?.receiptFooter ?? "Terima kasih!", queuePrefix: row?.queuePrefix ?? "A", hasPin: Boolean(row?.supervisorPinHash), pinHash: row?.supervisorPinHash ?? null };
}

/** Cash-drawer picture of one shift: sales by method, cash refunds, and what the drawer should hold. */
async function shiftSummary(shift: typeof posShifts.$inferSelect) {
  return (await shiftSummaries([shift]))[0];
}

// Two queries for any number of shifts (the history list used to run two per shift: 60 round-trips to Neon for 30 shifts).
async function shiftSummaries(shifts: (typeof posShifts.$inferSelect)[]) {
  if (shifts.length === 0) return [];
  const ids = shifts.map((s) => s.id);
  const [allOrders, allRefunds] = await Promise.all([
    db.select({ shiftId: posOrders.shiftId, method: posOrders.paymentMethod, total: posOrders.total }).from(posOrders).where(inArray(posOrders.shiftId, ids)),
    db.select({ shiftId: posRefunds.shiftId, amount: posRefunds.amount, method: posOrders.paymentMethod }).from(posRefunds).innerJoin(posOrders, eq(posRefunds.orderId, posOrders.id)).where(inArray(posRefunds.shiftId, ids)),
  ]);
  return shifts.map((shift) => summarizeShift(shift, allOrders.filter((o) => o.shiftId === shift.id), allRefunds.filter((r) => r.shiftId === shift.id)));
}

function summarizeShift(shift: typeof posShifts.$inferSelect, orders: { method: string; total: string | null }[], refunds: { amount: string | null; method: string }[]) {
  const byMethod: Record<string, number> = { cash: 0, qris: 0, transfer: 0, other: 0 };
  for (const o of orders) byMethod[o.method] = (byMethod[o.method] ?? 0) + num(o.total);
  const cashRefunds = refunds.filter((r) => r.method === "cash").reduce((s, r) => s + num(r.amount), 0);
  const refundTotal = refunds.reduce((s, r) => s + num(r.amount), 0);
  const expected = expectedCash(num(shift.openingCash), byMethod.cash, cashRefunds);
  return {
    id: shift.id, cashierName: shift.cashierName, openedAt: shift.openedAt, closedAt: shift.closedAt, note: shift.note,
    openingCash: num(shift.openingCash), orderCount: orders.length, salesByMethod: byMethod, salesTotal: orders.reduce((s, o) => s + num(o.total), 0),
    refundTotal, cashRefunds, expectedCash: shift.closedAt ? num(shift.expectedCash) : expected,
    countedCash: shift.countedCash === null ? null : num(shift.countedCash),
    difference: shift.countedCash === null ? null : num(shift.countedCash) - (shift.closedAt ? num(shift.expectedCash) : expected),
  };
}

// --- catalog & settings -------------------------------------------------------------------------------------------

posRouter.get("/catalog", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const [pk, products, booths, shift, settings, customFrames] = await Promise.all([
      db.select().from(packages).where(and(eq(packages.tenantId, tenantId), eq(packages.active, true))).orderBy(asc(packages.sortOrder), asc(packages.createdAt)),
      db.select().from(posProducts).where(and(eq(posProducts.tenantId, tenantId), eq(posProducts.active, true))).orderBy(asc(posProducts.sortOrder), asc(posProducts.createdAt)),
      db.select({ id: kioskKeys.id, label: kioskKeys.label }).from(kioskKeys).where(and(eq(kioskKeys.tenantId, tenantId), sql`${kioskKeys.revokedAt} is null`)),
      openShift(tenantId),
      getSettings(tenantId),
      // Custom frames the admin uploaded and priced; the cashier sells one together with a package.
      db.select().from(templates).where(and(eq(templates.tenantId, tenantId), eq(templates.active, true), eq(templates.category, CUSTOM_FRAME_CATEGORY))).orderBy(desc(templates.createdAt)),
    ]);
    res.json({
      customFrames: customFrames.map((f) => ({ id: f.id, name: f.name, customerName: f.customerName, price: num(f.price), imageUrl: resolveFrameUrl(f.frameImageUrl), orientation: f.orientation })),
      packages: pk.map((p) => ({ id: p.id, name: p.name, price: num(p.price), photoCount: p.photoCount, thumbnailUrl: p.thumbnailUrl, prints: (p.extraPrints ?? []).map((x) => ({ key: `${p.id}:${x.id}`, name: x.name, price: x.price })) })),
      products: products.map((p) => ({ id: p.id, name: p.name, price: num(p.price) })),
      booths, shift: shift ? { id: shift.id, cashierName: shift.cashierName, openedAt: shift.openedAt } : null,
      settings: { receiptHeader: settings.receiptHeader, receiptFooter: settings.receiptFooter, queuePrefix: settings.queuePrefix, hasPin: settings.hasPin },
    });
  } catch (e) { fail(res, e); }
});

posRouter.get("/settings", async (req, res) => {
  const { pinHash: _omit, ...rest } = await getSettings(req.tenantId!);
  res.json(rest);
});

posRouter.put("/settings", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const b = req.body ?? {};
    const patch: Partial<typeof posSettings.$inferInsert> = { updatedAt: new Date() };
    if (b.receiptHeader !== undefined) patch.receiptHeader = String(b.receiptHeader).slice(0, 200);
    if (b.receiptFooter !== undefined) patch.receiptFooter = String(b.receiptFooter).slice(0, 200);
    if (b.queuePrefix !== undefined) patch.queuePrefix = String(b.queuePrefix).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "A";
    if (b.clearPin === true) patch.supervisorPinHash = null;
    else if (b.supervisorPin !== undefined && String(b.supervisorPin) !== "") {
      const pin = String(b.supervisorPin);
      if (!/^\d{4,8}$/.test(pin)) throw new PosError("PIN supervisor harus 4–8 angka");
      patch.supervisorPinHash = hashPassword(pin);
    }
    await db.insert(posSettings).values({ tenantId, ...patch }).onConflictDoUpdate({ target: posSettings.tenantId, set: patch });
    const { pinHash: _omit, ...rest } = await getSettings(tenantId);
    res.json(rest);
  } catch (e) { fail(res, e); }
});

// --- products -----------------------------------------------------------------------------------------------------

function productBody(b: Record<string, unknown>) {
  const name = String(b.name ?? "").trim().slice(0, 80);
  const price = Math.round(Number(b.price));
  if (!name) throw new PosError("Nama produk wajib diisi");
  if (!Number.isFinite(price) || price < 0 || price > 100_000_000) throw new PosError("Harga produk tidak valid");
  return { name, price: String(price) };
}

posRouter.get("/products", async (req, res) => {
  const rows = await db.select().from(posProducts).where(eq(posProducts.tenantId, req.tenantId!)).orderBy(asc(posProducts.sortOrder), asc(posProducts.createdAt));
  res.json(rows.map((p) => ({ id: p.id, name: p.name, price: num(p.price), active: p.active })));
});
posRouter.post("/products", async (req, res) => {
  try {
    const [row] = await db.insert(posProducts).values({ tenantId: req.tenantId!, ...productBody(req.body ?? {}) }).returning();
    res.status(201).json({ id: row.id, name: row.name, price: num(row.price), active: row.active });
  } catch (e) { fail(res, e); }
});
posRouter.patch("/products/:id", async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) throw new PosError("ID tidak valid", 404);
    const b = req.body ?? {};
    const patch: Partial<typeof posProducts.$inferInsert> = {};
    if (b.name !== undefined || b.price !== undefined) {
      const [cur] = await db.select().from(posProducts).where(and(eq(posProducts.id, req.params.id), eq(posProducts.tenantId, req.tenantId!)));
      if (!cur) throw new PosError("Produk tidak ditemukan", 404);
      Object.assign(patch, productBody({ name: b.name ?? cur.name, price: b.price ?? cur.price }));
    }
    if (b.active !== undefined) patch.active = Boolean(b.active);
    const [row] = await db.update(posProducts).set(patch).where(and(eq(posProducts.id, req.params.id), eq(posProducts.tenantId, req.tenantId!))).returning();
    if (!row) throw new PosError("Produk tidak ditemukan", 404);
    res.json({ id: row.id, name: row.name, price: num(row.price), active: row.active });
  } catch (e) { fail(res, e); }
});
posRouter.delete("/products/:id", async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: "Produk tidak ditemukan" });
  await db.delete(posProducts).where(and(eq(posProducts.id, req.params.id), eq(posProducts.tenantId, req.tenantId!))); // past orders keep their own copy of the line
  res.json({ ok: true });
});

// --- shifts -------------------------------------------------------------------------------------------------------

posRouter.get("/shifts/current", async (req, res) => {
  const shift = await openShift(req.tenantId!);
  res.json(shift ? await shiftSummary(shift) : null);
});

posRouter.get("/shifts", async (req, res) => {
  const rows = await db.select().from(posShifts).where(eq(posShifts.tenantId, req.tenantId!)).orderBy(desc(posShifts.openedAt)).limit(30);
  res.json(await shiftSummaries(rows));
});

posRouter.post("/shifts/open", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const cashierName = String(req.body?.cashierName ?? "").trim().slice(0, 60);
    const openingCash = Math.round(Number(req.body?.openingCash ?? 0));
    if (!cashierName) throw new PosError("Nama kasir wajib diisi");
    if (!Number.isFinite(openingCash) || openingCash < 0 || openingCash > 1_000_000_000) throw new PosError("Modal awal tidak valid");
    if (await openShift(tenantId)) throw new PosError("Masih ada shift yang berjalan. Tutup dulu sebelum membuka yang baru.", 409);
    const [row] = await db.insert(posShifts).values({ tenantId, cashierName, openingCash: String(openingCash) }).returning();
    res.status(201).json(await shiftSummary(row));
  } catch (e) { fail(res, e); }
});

posRouter.post("/shifts/close", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const shift = await openShift(tenantId);
    if (!shift) throw new PosError("Tidak ada shift yang berjalan", 409);
    const countedCash = Math.round(Number(req.body?.countedCash));
    if (!Number.isFinite(countedCash) || countedCash < 0) throw new PosError("Isi jumlah uang di laci kas");
    const summary = await shiftSummary(shift);
    const [row] = await db.update(posShifts).set({ closedAt: new Date(), countedCash: String(countedCash), expectedCash: String(summary.expectedCash), note: String(req.body?.note ?? "").slice(0, 300) || null }).where(eq(posShifts.id, shift.id)).returning();
    res.json(await shiftSummary(row));
  } catch (e) { fail(res, e); }
});

// --- orders -------------------------------------------------------------------------------------------------------

async function loadCatalog(tenantId: string): Promise<Catalog> {
  const [pk, products, frames] = await Promise.all([
    db.select().from(packages).where(and(eq(packages.tenantId, tenantId), eq(packages.active, true))),
    db.select().from(posProducts).where(and(eq(posProducts.tenantId, tenantId), eq(posProducts.active, true))),
    db.select().from(templates).where(and(eq(templates.tenantId, tenantId), eq(templates.active, true), eq(templates.category, CUSTOM_FRAME_CATEGORY))),
  ]);
  const catalog: Catalog = { packages: new Map(), prints: new Map(), products: new Map(), frames: new Map() };
  for (const f of frames) catalog.frames.set(f.id, { name: f.customerName ? `Frame custom · ${f.customerName}` : `Frame custom · ${f.name}`, price: num(f.price) });
  for (const p of pk) {
    catalog.packages.set(p.id, { name: p.name, price: num(p.price) });
    for (const x of p.extraPrints ?? []) catalog.prints.set(`${p.id}:${x.id}`, { name: `${x.name} (${p.name})`, price: x.price });
  }
  for (const p of products) catalog.products.set(p.id, { name: p.name, price: num(p.price) });
  return catalog;
}

const serializeOrder = (o: typeof posOrders.$inferSelect) => ({
  id: o.id, orderNumber: o.orderNumber, items: o.items, subtotal: num(o.subtotal), discount: num(o.discount), total: num(o.total),
  paymentMethod: o.paymentMethod, cashReceived: o.cashReceived === null ? null : num(o.cashReceived), changeGiven: o.changeGiven === null ? null : num(o.changeGiven),
  status: o.status, refundedAmount: num(o.refundedAmount), customerName: o.customerName, customerWhatsapp: o.customerWhatsapp,
  kioskVoucherCode: o.kioskVoucherCode, queueTicketId: o.queueTicketId, shiftId: o.shiftId, createdAt: o.createdAt,
});

posRouter.post("/orders", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const b = req.body ?? {};
    const shift = await openShift(tenantId);
    if (!shift) throw new PosError("Buka shift dulu sebelum menerima transaksi", 409);

    const items = priceCart(b.items as CartLine[], await loadCatalog(tenantId));
    const { subtotal, discount, total } = computeTotals(items, b.discount);
    const pay = settlePayment(b.paymentMethod, total, b.cashReceived);
    const customerName = String(b.customerName ?? "").trim().slice(0, 100) || null;
    const customerWhatsapp = String(b.customerWhatsapp ?? "").replace(/[^\d+]/g, "").slice(0, 20) || null;
    const queueTicketId = typeof b.queueTicketId === "string" && UUID.test(b.queueTicketId) ? b.queueTicketId : null;
    const kioskAmount = kioskPortionOf(items, discount);
    const customFrame = customFrameOf(items);

    const day = wibDay(new Date());
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const order = await db.transaction(async (tx) => {
          const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(posOrders).where(and(eq(posOrders.tenantId, tenantId), like(posOrders.orderNumber, `KSR-${day.replaceAll("-", "")}-%`)));
          const number = orderNumber(day, n + 1 + attempt);
          let voucherCode: string | null = null;
          if (kioskAmount > 0 || customFrame) {
            voucherCode = `CASH-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
            await tx.insert(vouchers).values({ tenantId, code: voucherCode, voucherType: "cash", discountType: "free", discountValue: "0", cashAmount: String(kioskAmount), invoiceNumber: number, customerName, maxUses: 1, active: true, frameId: customFrame?.frameId ?? null });
          }
          const [row] = await tx.insert(posOrders).values({
            tenantId, shiftId: shift.id, orderNumber: number, items, subtotal: String(subtotal), discount: String(discount), total: String(total),
            paymentMethod: pay.method, cashReceived: pay.cashReceived === null ? null : String(pay.cashReceived), changeGiven: pay.change === null ? null : String(pay.change),
            customerName, customerWhatsapp, kioskVoucherCode: voucherCode, queueTicketId,
          }).returning();
          if (queueTicketId) await tx.update(posQueueTickets).set({ orderId: row.id }).where(and(eq(posQueueTickets.id, queueTicketId), eq(posQueueTickets.tenantId, tenantId)));
          return row;
        });
        return res.status(201).json(serializeOrder(order));
      } catch (e) {
        if (!isUniqueViolation(e) || attempt === 3) throw e;
      }
    }
  } catch (e) { fail(res, e); }
});

posRouter.get("/orders", async (req, res) => {
  const tenantId = req.tenantId!;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from ?? "")) ? startOfWibDay(String(req.query.from)) : new Date(Date.now() - 7 * DAY_MS);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to ?? "")) ? new Date(startOfWibDay(String(req.query.to)).getTime() + DAY_MS) : new Date(Date.now() + DAY_MS);
  const limit = Math.min(500, Math.max(1, Math.floor(Number(req.query.limit)) || 100));
  const rows = await db.select().from(posOrders).where(and(eq(posOrders.tenantId, tenantId), gte(posOrders.createdAt, from), lt(posOrders.createdAt, to))).orderBy(desc(posOrders.createdAt)).limit(limit);
  res.json(rows.map(serializeOrder));
});

posRouter.get("/orders/:id", async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: "Transaksi tidak ditemukan" });
  const [row] = await db.select().from(posOrders).where(and(eq(posOrders.id, req.params.id), eq(posOrders.tenantId, req.tenantId!)));
  if (!row) return res.status(404).json({ error: "Transaksi tidak ditemukan" });
  const [refunds, settings] = await Promise.all([
    db.select().from(posRefunds).where(eq(posRefunds.orderId, row.id)).orderBy(asc(posRefunds.createdAt)),
    getSettings(req.tenantId!),
  ]);
  res.json({ ...serializeOrder(row), refunds: refunds.map((r) => ({ id: r.id, amount: num(r.amount), reason: r.reason, createdAt: r.createdAt })), receipt: { header: settings.receiptHeader, footer: settings.receiptFooter } });
});

// Wrong-PIN throttle: 5 misses lock refunds for that tenant for 5 minutes (in-memory; fine for a single API process).
const pinMisses = new Map<string, { count: number; until: number }>();

posRouter.post("/orders/:id/refund", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    if (!UUID.test(req.params.id)) throw new PosError("Transaksi tidak ditemukan", 404);

    const settings = await getSettings(tenantId);
    if (settings.pinHash) {
      const miss = pinMisses.get(tenantId);
      if (miss && miss.until > Date.now()) throw new PosError("Terlalu banyak PIN salah. Coba lagi beberapa menit lagi.", 429);
      if (!verifyPassword(String(req.body?.pin ?? ""), settings.pinHash)) {
        const count = (miss && miss.until > Date.now() - 300_000 ? miss.count : 0) + 1;
        pinMisses.set(tenantId, { count, until: count >= 5 ? Date.now() + 300_000 : 0 });
        throw new PosError("PIN supervisor salah", 403);
      }
      pinMisses.delete(tenantId);
    }

    const reason = String(req.body?.reason ?? "").trim().slice(0, 200);
    if (!reason) throw new PosError("Alasan refund wajib diisi");
    const result = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(posOrders).where(and(eq(posOrders.id, req.params.id), eq(posOrders.tenantId, tenantId))).for("update");
      if (!order) throw new PosError("Transaksi tidak ditemukan", 404);
      const lines = req.body?.items as RefundLine[];
      const amount = refundAmount({ items: order.items, subtotal: num(order.subtotal), total: num(order.total), refundedAmount: num(order.refundedAmount) }, lines);
      const shift = order.paymentMethod === "cash" ? await openShift(tenantId) : null;
      if (order.paymentMethod === "cash" && !shift) throw new PosError("Buka shift dulu: refund tunai mengeluarkan uang dari laci kas", 409);
      const refunded = num(order.refundedAmount) + amount;
      await tx.insert(posRefunds).values({ tenantId, orderId: order.id, shiftId: shift?.id ?? null, amount: String(amount), items: lines.map((l) => ({ index: l.index, qty: Math.floor(Number(l.qty)) })), reason });
      const [updated] = await tx.update(posOrders).set({ refundedAmount: String(refunded), status: refundStatus(num(order.total), refunded) }).where(eq(posOrders.id, order.id)).returning();

      // A refunded booth line should not leave a usable kiosk code behind.
      let voucher: "none" | "deactivated" | "already_used" = "none";
      const boothRefunded = lines.some((l) => { const t = order.items[l.index]?.type; return t === "package" || t === "print"; });
      if (boothRefunded && order.kioskVoucherCode) {
        const [v] = await tx.select().from(vouchers).where(and(eq(vouchers.tenantId, tenantId), eq(vouchers.code, order.kioskVoucherCode)));
        if (v && v.usedCount === 0) { await tx.update(vouchers).set({ active: false }).where(eq(vouchers.id, v.id)); voucher = "deactivated"; }
        else if (v) voucher = "already_used";
      }
      return { order: serializeOrder(updated), amount, voucher };
    });
    res.json(result);
  } catch (e) { fail(res, e); }
});

// --- queue --------------------------------------------------------------------------------------------------------

const serializeTicket = (t: typeof posQueueTickets.$inferSelect) => ({
  id: t.id, label: t.label, seq: t.seq, customerName: t.customerName, customerWhatsapp: t.customerWhatsapp, partySize: t.partySize,
  status: t.status, kioskKeyId: t.kioskKeyId, orderId: t.orderId, createdAt: t.createdAt, calledAt: t.calledAt, doneAt: t.doneAt,
});

posRouter.get("/queue", async (req, res) => {
  const rows = await db.select().from(posQueueTickets).where(and(eq(posQueueTickets.tenantId, req.tenantId!), eq(posQueueTickets.queueDate, wibDay(new Date())))).orderBy(asc(posQueueTickets.seq));
  res.json(rows.map(serializeTicket));
});

posRouter.post("/queue", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const day = wibDay(new Date());
    const settings = await getSettings(tenantId);
    const customerName = String(req.body?.customerName ?? "").trim().slice(0, 80) || null;
    const customerWhatsapp = String(req.body?.customerWhatsapp ?? "").replace(/[^\d+]/g, "").slice(0, 20) || null;
    const partySize = Math.min(30, Math.max(1, Math.floor(Number(req.body?.partySize)) || 1));
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${posQueueTickets.seq}), 0)::int` }).from(posQueueTickets).where(and(eq(posQueueTickets.tenantId, tenantId), eq(posQueueTickets.queueDate, day)));
      try {
        const [row] = await db.insert(posQueueTickets).values({ tenantId, queueDate: day, seq: max + 1, label: queueLabel(settings.queuePrefix, max + 1), customerName, customerWhatsapp, partySize }).returning();
        return res.status(201).json(serializeTicket(row));
      } catch (e) { if (!isUniqueViolation(e) || attempt === 3) throw e; }
    }
  } catch (e) { fail(res, e); }
});

const TICKET_STATUSES = ["waiting", "called", "serving", "done", "skipped"] as const;

posRouter.post("/queue/next", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const today = await db.select().from(posQueueTickets).where(and(eq(posQueueTickets.tenantId, tenantId), eq(posQueueTickets.queueDate, wibDay(new Date()))));
    const next = pickNextTicket(today);
    if (!next) throw new PosError("Tidak ada antrian yang menunggu", 404);
    const kioskKeyId = typeof req.body?.kioskKeyId === "string" && UUID.test(req.body.kioskKeyId) ? req.body.kioskKeyId : null;
    const [row] = await db.update(posQueueTickets).set({ status: "called", calledAt: new Date(), ...(kioskKeyId ? { kioskKeyId } : {}) }).where(eq(posQueueTickets.id, next.id)).returning();
    res.json(serializeTicket(row));
  } catch (e) { fail(res, e); }
});

posRouter.patch("/queue/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    if (!UUID.test(req.params.id)) throw new PosError("Tiket tidak ditemukan", 404);
    const status = String(req.body?.status ?? "");
    if (!TICKET_STATUSES.includes(status as (typeof TICKET_STATUSES)[number])) throw new PosError("Status antrian tidak valid");
    const patch: Partial<typeof posQueueTickets.$inferInsert> = { status };
    if (status === "called") patch.calledAt = new Date();
    if (status === "done" || status === "skipped") patch.doneAt = new Date();
    if (req.body?.kioskKeyId !== undefined) {
      const k = req.body.kioskKeyId;
      if (k === null) patch.kioskKeyId = null;
      else if (typeof k === "string" && UUID.test(k)) {
        const [own] = await db.select({ id: kioskKeys.id }).from(kioskKeys).where(and(eq(kioskKeys.id, k), eq(kioskKeys.tenantId, tenantId)));
        if (!own) throw new PosError("Booth tidak ditemukan");
        patch.kioskKeyId = k;
      }
    }
    const [row] = await db.update(posQueueTickets).set(patch).where(and(eq(posQueueTickets.id, req.params.id), eq(posQueueTickets.tenantId, tenantId))).returning();
    if (!row) throw new PosError("Tiket tidak ditemukan", 404);
    res.json(serializeTicket(row));
  } catch (e) { fail(res, e); }
});

// --- report -------------------------------------------------------------------------------------------------------

posRouter.get("/report", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const days = Math.min(90, Math.max(1, Math.floor(Number(req.query.days)) || 14));
    const since = new Date(startOfWibDay(wibDay(new Date())).getTime() - (days - 1) * DAY_MS);
    const [orders, refunds] = await Promise.all([
      db.select().from(posOrders).where(and(eq(posOrders.tenantId, tenantId), gte(posOrders.createdAt, since))),
      db.select({ amount: posRefunds.amount, createdAt: posRefunds.createdAt }).from(posRefunds).where(and(eq(posRefunds.tenantId, tenantId), gte(posRefunds.createdAt, since))),
    ]);
    const daily = new Map<string, { date: string; orders: number; sales: number; refunds: number }>();
    for (let i = days - 1; i >= 0; i -= 1) { const d = wibDay(new Date(Date.now() - i * DAY_MS)); daily.set(d, { date: d, orders: 0, sales: 0, refunds: 0 }); }
    const byMethod: Record<string, number> = {};
    const top = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of orders) {
      const d = daily.get(wibDay(o.createdAt)); if (d) { d.orders += 1; d.sales += num(o.total); }
      byMethod[o.paymentMethod] = (byMethod[o.paymentMethod] ?? 0) + num(o.total);
      for (const it of o.items as PosOrderItem[]) { const e = top.get(it.name) ?? { name: it.name, qty: 0, revenue: 0 }; e.qty += it.qty; e.revenue += it.unitPrice * it.qty; top.set(it.name, e); }
    }
    for (const r of refunds) { const d = daily.get(wibDay(r.createdAt)); if (d) d.refunds += num(r.amount); }
    const sales = orders.reduce((s, o) => s + num(o.total), 0);
    const refundTotal = refunds.reduce((s, r) => s + num(r.amount), 0);
    res.json({
      days, orders: orders.length, sales, refunds: refundTotal, net: sales - refundTotal, average: orders.length ? Math.round(sales / orders.length) : 0,
      byMethod, daily: [...daily.values()], topItems: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    });
  } catch (e) { fail(res, e); }
});
