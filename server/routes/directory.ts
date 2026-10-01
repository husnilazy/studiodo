import { Router } from "express";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { platformSettings, tenants } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { computeLocked } from "../lib/subscription.js";
import { logEvent } from "../lib/platformEvents.js";

// --- Public booth directory ---------------------------------------------------------------

export const publicDirectoryRouter = Router();

const BUSINESS_TYPES: Record<string, string> = {
  photobooth_rental: "Sewa photobooth",
  event_organizer: "Event organizer",
  studio: "Studio foto",
  other: "Lainnya",
};

function cleanInstagram(handle: string | null): string | null {
  const h = (handle ?? "").trim().replace(/^@/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : null; // only ever emit something safe to put in a URL
}

function cleanWebsite(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// GET /api/public/directory?city= — opted-in tenants whose subscription isn't suspended/locked.
publicDirectoryRouter.get("/directory", async (req, res) => {
  const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
  const rows = await db
    .select({
      id: tenants.id, name: tenants.name, city: tenants.city, businessType: tenants.businessType,
      description: tenants.directoryDescription, instagram: tenants.instagramHandle, website: tenants.website,
      whatsapp: tenants.ownerWhatsapp, showWhatsapp: tenants.directoryShowWhatsapp,
      status: tenants.status, endsAt: tenants.subscriptionEndsAt,
    })
    .from(tenants)
    .where(and(eq(tenants.directoryListed, true), eq(tenants.status, "active"), isNotNull(tenants.city), city ? sql`lower(${tenants.city}) = lower(${city})` : sql`true`))
    .orderBy(asc(tenants.city), asc(tenants.name))
    .limit(500);

  // Hide tenants whose subscription lapsed past the grace period (same rule the kiosk uses to lock),
  // computed from the rows already in hand plus one settings read — not one query per tenant.
  const [settings] = await db.select({ gracePeriodDays: platformSettings.gracePeriodDays }).from(platformSettings).limit(1);
  const grace = settings?.gracePeriodDays ?? 3;
  const live = rows.filter((r) => !computeLocked(r.status, r.endsAt ? new Date(r.endsAt) : null, grace));

  const cities = [...new Set(live.map((r) => r.city!.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
  res.set("Cache-Control", "public, max-age=120");
  res.json({
    cities,
    items: live.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      type: BUSINESS_TYPES[r.businessType ?? ""] ?? null,
      description: r.description ?? "",
      instagram: cleanInstagram(r.instagram),
      website: cleanWebsite(r.website),
      whatsapp: r.showWhatsapp ? (r.whatsapp ?? "").replace(/\D/g, "") || null : null,
    })),
  });
});

// --- Tenant: manage own listing (mounted under /api/portal/directory) ----------------------

export const directoryTenantRouter = Router();
directoryTenantRouter.use(requireAdminAuth);

directoryTenantRouter.get("/", async (req, res) => {
  const [t] = await db.select({
    name: tenants.name, city: tenants.city, businessType: tenants.businessType, instagram: tenants.instagramHandle,
    website: tenants.website, whatsapp: tenants.ownerWhatsapp,
    listed: tenants.directoryListed, description: tenants.directoryDescription, showWhatsapp: tenants.directoryShowWhatsapp,
  }).from(tenants).where(eq(tenants.id, req.tenantId!));
  if (!t) return res.status(404).json({ error: "Tenant tidak ditemukan" });
  res.json({ ...t, description: t.description ?? "" });
});

// PUT /api/portal/directory — { listed, description, showWhatsapp, city?, instagram?, website? }
// City/instagram/website live on the tenant profile; editing them here keeps the public card accurate.
directoryTenantRouter.put("/", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const listed = b.listed === true;
  const showWhatsapp = b.showWhatsapp === true;
  const description = str(b.description, 300);
  const city = str(b.city, 100);
  const instagram = str(b.instagram, 60).replace(/^@/, "");
  const website = str(b.website, 200);

  if (listed && !city) return res.status(400).json({ error: "Isi kota terlebih dulu supaya booth Anda bisa dicari" });
  if (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) return res.status(400).json({ error: "Username Instagram tidak valid" });
  if (website && !cleanWebsite(website)) return res.status(400).json({ error: "Alamat website tidak valid" });

  const [row] = await db.update(tenants).set({
    directoryListed: listed,
    directoryShowWhatsapp: showWhatsapp,
    directoryDescription: description || null,
    city: city || null,
    instagramHandle: instagram || null,
    website: website || null,
  }).where(eq(tenants.id, req.tenantId!)).returning({ name: tenants.name });
  if (!row) return res.status(404).json({ error: "Tenant tidak ditemukan" });

  logEvent({ tenantId: req.tenantId!, category: "tenant", action: listed ? "directory.listed" : "directory.unlisted", message: `Direktori booth: "${row.name}" ${listed ? "ditampilkan" : "disembunyikan"}`, actorType: "tenant_admin" });
  res.json({ ok: true });
});
