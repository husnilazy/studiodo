import { desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, kioskKeys, tenantApplications, tenants } from "../db/schema.js";

// Ctrl+K: one box that finds a tenant, a lead, an admin login or a booth by whatever the owner remembers (name, email, phone, city, label).

export interface SearchHit { type: "tenant" | "lead" | "admin" | "booth"; id: string; title: string; subtitle: string; tenantId?: string }

/** `%` and `_` are wildcards in LIKE; user input must not act as them. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function globalSearch(raw: string, limit = 6): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return [];
  const pat = likePattern(q);
  const digits = q.replace(/\D/g, "");
  const phonePat = digits.length >= 4 ? likePattern(digits.replace(/^0/, "")) : null; // "0812…" must also find "62812…" / "+62 812…"
  const [tenantRows, leadRows, adminRows, boothRows] = await Promise.all([
    db.select({ id: tenants.id, name: tenants.name, slug: tenants.slug, owner: tenants.ownerName, city: tenants.city, phone: tenants.ownerWhatsapp, status: tenants.status }).from(tenants)
      .where(or(ilike(tenants.name, pat), ilike(tenants.slug, pat), ilike(tenants.ownerName, pat), ilike(tenants.city, pat), ilike(tenants.ownerWhatsapp, pat), phonePat ? ilike(tenants.ownerWhatsapp, phonePat) : undefined)).limit(limit),
    db.select({ id: tenantApplications.id, business: tenantApplications.businessName, owner: tenantApplications.ownerName, email: tenantApplications.ownerEmail, stage: tenantApplications.pipelineStage }).from(tenantApplications)
      .where(or(ilike(tenantApplications.businessName, pat), ilike(tenantApplications.ownerName, pat), ilike(tenantApplications.ownerEmail, pat), ilike(tenantApplications.ownerWhatsapp, pat), phonePat ? ilike(tenantApplications.ownerWhatsapp, phonePat) : undefined)).orderBy(desc(tenantApplications.createdAt)).limit(limit),
    db.select({ id: admins.id, email: admins.email, tenantId: admins.tenantId, tenant: tenants.name }).from(admins).innerJoin(tenants, eq(tenants.id, admins.tenantId)).where(ilike(admins.email, pat)).limit(limit),
    db.select({ id: kioskKeys.id, label: kioskKeys.label, tenantId: kioskKeys.tenantId, tenant: tenants.name, version: kioskKeys.appVersion }).from(kioskKeys).innerJoin(tenants, eq(tenants.id, kioskKeys.tenantId)).where(ilike(kioskKeys.label, pat)).limit(limit),
  ]);
  return [
    ...tenantRows.map((t): SearchHit => ({ type: "tenant", id: t.id, title: t.name, subtitle: [t.owner, t.city, t.phone].filter(Boolean).join(" · ") || t.slug, tenantId: t.id })),
    ...leadRows.map((l): SearchHit => ({ type: "lead", id: l.id, title: l.business, subtitle: `${l.owner} · ${l.email}` })),
    ...adminRows.map((a): SearchHit => ({ type: "admin", id: a.id, title: a.email, subtitle: `Admin ${a.tenant}`, tenantId: a.tenantId })),
    ...boothRows.map((b): SearchHit => ({ type: "booth", id: b.id, title: b.label ?? "(tanpa label)", subtitle: `Booth ${b.tenant}${b.version ? ` · v${b.version}` : ""}`, tenantId: b.tenantId })),
  ];
}
