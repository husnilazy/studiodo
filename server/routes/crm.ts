import { Router } from "express";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { customerProfiles, kioskKeys, packages, sessions } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { contactKeySql, emailSql, isContactKey, waSql } from "../lib/crm.js";

// CRM for the tenant dashboard, the kiosk app's admin and the website portal (mounted at /api/crm, tenant-admin auth).
// One row per CUSTOMER — sessions grouped by contact key (see lib/crm.ts) — never one row per session.

export const crmRouter = Router();
crmRouter.use(requireAdminAuth);

const SORTS: Record<string, string> = {
  recent: "agg.last_seen desc",
  visits: "agg.paid_sessions desc, agg.last_seen desc",
  spend: "agg.total_spend desc, agg.last_seen desc",
  name: "lower(coalesce(p.name, agg.wa, agg.email)) asc",
};
const FILTERS = ["all", "returning", "new", "consent", "optout"] as const;

const rowsOf = <T,>(result: unknown): T[] => (Array.isArray(result) ? (result as T[]) : ((result as { rows?: T[] }).rows ?? []));

/** The aggregated customer table as a CTE, scoped to one tenant. */
function customersCte(tenantId: string): SQL {
  return sql`
    with s as (
      select ${contactKeySql} as ckey, ${waSql} as wa, ${emailSql} as email, ${sessions.createdAt} as created_at,
             ${sessions.paymentStatus} as payment_status, ${sessions.totalAmount} as total_amount,
             ${sessions.publishConsent} as publish_consent, ${sessions.feedback} as feedback, ${sessions.shareUrl} as share_url
      from ${sessions} where ${sessions.tenantId} = ${tenantId}
    ), agg as (
      select ckey,
             max(wa) as wa, max(email) as email,
             count(*)::int as sessions,
             (count(*) filter (where payment_status = 'success'))::int as paid_sessions,
             coalesce(sum(total_amount) filter (where payment_status = 'success'), 0)::float8 as total_spend,
             min(created_at) as first_seen, max(created_at) as last_seen,
             bool_or(publish_consent) as consent,
             (array_agg(feedback order by created_at desc) filter (where feedback is not null and feedback <> ''))[1] as last_feedback,
             (array_agg(share_url order by created_at desc) filter (where share_url is not null))[1] as last_share_url
      from s where ckey is not null group by ckey
    )`;
}

type CustomerRow = {
  ckey: string; wa: string | null; email: string | null; sessions: number; paid_sessions: number; total_spend: number;
  first_seen: string | Date; last_seen: string | Date; consent: boolean; last_feedback: string | null; last_share_url: string | null;
  name: string | null; notes: string | null; tags: string[] | null; marketing_opt_out: boolean | null; total_count?: number;
};

const shape = (r: CustomerRow) => ({
  key: r.ckey, name: r.name, whatsapp: r.wa, email: r.email, sessions: r.sessions, paidSessions: r.paid_sessions, totalSpend: Number(r.total_spend),
  firstSeen: r.first_seen, lastSeen: r.last_seen, consent: r.consent, lastFeedback: r.last_feedback, lastShareUrl: r.last_share_url,
  notes: r.notes, tags: r.tags ?? [], marketingOptOut: Boolean(r.marketing_opt_out),
});

function buildFilters(query: Record<string, unknown>): SQL[] {
  const conds: SQL[] = [];
  const q = String(query.q ?? "").trim().slice(0, 80);
  if (q) {
    const digits = q.replace(/\D/g, "");
    const intl = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    const parts: SQL[] = [sql`agg.email ilike ${like}`, sql`p.name ilike ${like}`, sql`p.notes ilike ${like}`];
    if (intl.length >= 3) parts.push(sql`agg.wa like ${`%${intl}%`}`);
    conds.push(sql`(${sql.join(parts, sql` or `)})`);
  }
  const filter = FILTERS.includes(String(query.filter) as (typeof FILTERS)[number]) ? String(query.filter) : "all";
  if (filter === "returning") conds.push(sql`agg.paid_sessions >= 2`);
  if (filter === "new") conds.push(sql`agg.first_seen >= now() - interval '30 days'`);
  if (filter === "consent") conds.push(sql`agg.consent`);
  if (filter === "optout") conds.push(sql`coalesce(p.marketing_opt_out, false)`);
  const tag = String(query.tag ?? "").trim().slice(0, 24);
  if (tag) conds.push(sql`p.tags ? ${tag}`);
  return conds;
}

async function listCustomers(tenantId: string, query: Record<string, unknown>, limit: number, offset: number) {
  const sortSql = SORTS[String(query.sort)] ?? SORTS.recent;
  const conds = buildFilters(query);
  const where = conds.length ? sql`where ${sql.join(conds, sql` and `)}` : sql``;
  const result = await db.execute(sql`
    ${customersCte(tenantId)}
    select agg.*, p.name, p.notes, p.tags, p.marketing_opt_out, count(*) over ()::int as total_count
    from agg left join ${customerProfiles} p on p.tenant_id = ${tenantId} and p.contact_key = agg.ckey
    ${where}
    order by ${sql.raw(sortSql)}
    limit ${limit} offset ${offset}`);
  const rows = rowsOf<CustomerRow>(result);
  return { items: rows.map(shape), total: rows[0]?.total_count ?? 0 };
}

// GET /api/crm/customers?q=&filter=all|returning|new|consent|optout&tag=&sort=recent|visits|spend|name&limit=&offset=
crmRouter.get("/customers", async (req, res) => {
  const tenantId = req.tenantId!;
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const [list, summaryResult, tagResult] = await Promise.all([
    listCustomers(tenantId, req.query, limit, offset),
    db.execute(sql`
      ${customersCte(tenantId)}
      select count(*)::int as customers,
             (count(*) filter (where wa is not null))::int as with_whatsapp,
             (count(*) filter (where consent))::int as consent,
             (count(*) filter (where paid_sessions >= 2))::int as returning,
             (count(*) filter (where first_seen >= now() - interval '30 days'))::int as new_30d,
             coalesce(sum(total_spend), 0)::float8 as lifetime_spend
      from agg`),
    db.execute(sql`select distinct jsonb_array_elements_text(tags) as tag from ${customerProfiles} where tenant_id = ${tenantId} order by 1 limit 50`),
  ]);
  const s = rowsOf<Record<string, number>>(summaryResult)[0] ?? {};
  res.json({
    items: list.items, total: list.total, limit, offset,
    summary: {
      customers: s.customers ?? 0, withWhatsapp: s.with_whatsapp ?? 0, consent: s.consent ?? 0, returning: s.returning ?? 0,
      new30d: s.new_30d ?? 0, lifetimeSpend: Number(s.lifetime_spend ?? 0),
    },
    tags: rowsOf<{ tag: string }>(tagResult).map((r) => r.tag),
  });
});

// GET /api/crm/customer?key=wa:62…|em:… — one customer with their full session history
crmRouter.get("/customer", async (req, res) => {
  const tenantId = req.tenantId!;
  const key = String(req.query.key ?? "");
  if (!isContactKey(key)) return res.status(400).json({ error: "Kunci pelanggan tidak valid" });

  const [list, history] = await Promise.all([
    db.execute(sql`
      ${customersCte(tenantId)}
      select agg.*, p.name, p.notes, p.tags, p.marketing_opt_out
      from agg left join ${customerProfiles} p on p.tenant_id = ${tenantId} and p.contact_key = agg.ckey
      where agg.ckey = ${key}`),
    db.select({
      id: sessions.id, createdAt: sessions.createdAt, completedAt: sessions.completedAt, paymentStatus: sessions.paymentStatus,
      paymentMethod: sessions.paymentMethod, totalAmount: sessions.totalAmount, voucherCode: sessions.voucherCode,
      shareUrl: sessions.shareUrl, feedback: sessions.feedback, publishConsent: sessions.publishConsent,
      customerWhatsapp: sessions.customerWhatsapp, customerEmail: sessions.customerEmail,
      packageName: packages.name, boothLabel: kioskKeys.label,
      photoCount: sql<number>`coalesce(jsonb_array_length(${sessions.photoUrls}), 0)::int`,
    }).from(sessions)
      .leftJoin(packages, eq(packages.id, sessions.packageId))
      .leftJoin(kioskKeys, eq(kioskKeys.id, sessions.kioskKeyId))
      .where(and(eq(sessions.tenantId, tenantId), sql`${contactKeySql} = ${key}`))
      .orderBy(desc(sessions.createdAt)).limit(100),
  ]);
  const row = rowsOf<CustomerRow>(list)[0];
  if (!row) return res.status(404).json({ error: "Pelanggan tidak ditemukan" });
  res.json({
    customer: shape(row),
    sessions: history.map((h) => ({ ...h, totalAmount: Number(h.totalAmount ?? 0), customerWhatsapp: undefined, customerEmail: undefined })),
  });
});

// PUT /api/crm/customer { key, name?, notes?, tags?, marketingOptOut? } — what the tenant adds on top of the session data
crmRouter.put("/customer", async (req, res) => {
  const tenantId = req.tenantId!;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const key = String(body.key ?? "");
  if (!isContactKey(key)) return res.status(400).json({ error: "Kunci pelanggan tidak valid" });

  const values: Partial<typeof customerProfiles.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) values.name = String(body.name ?? "").trim().slice(0, 100) || null;
  if (body.notes !== undefined) values.notes = String(body.notes ?? "").trim().slice(0, 2000) || null;
  if (body.marketingOptOut !== undefined) values.marketingOptOut = body.marketingOptOut === true;
  if (body.tags !== undefined) {
    const list = Array.isArray(body.tags) ? body.tags : [];
    values.tags = [...new Set(list.map((t) => String(t).trim().replace(/\s+/g, " ").slice(0, 24)).filter(Boolean))].slice(0, 10);
  }
  if (Object.keys(values).length === 1) return res.status(400).json({ error: "Tidak ada perubahan yang dikirim" });

  // The customer must exist (have at least one session with this contact) — profiles for random keys are not created.
  const exists = rowsOf(await db.execute(sql`select 1 from ${sessions} where ${sessions.tenantId} = ${tenantId} and ${contactKeySql} = ${key} limit 1`));
  if (exists.length === 0) return res.status(404).json({ error: "Pelanggan tidak ditemukan" });

  await db.insert(customerProfiles).values({ tenantId, contactKey: key, ...values })
    .onConflictDoUpdate({ target: [customerProfiles.tenantId, customerProfiles.contactKey], set: values });
  res.json({ ok: true });
});

// GET /api/crm/export — every customer (max 10 000) for a CSV the client builds
crmRouter.get("/export", async (req, res) => {
  const { items } = await listCustomers(req.tenantId!, req.query, 10000, 0);
  res.json({ items });
});
