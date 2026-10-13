import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { marketplaceReports, marketplaceReviews, marketplaceTemplates, templates } from "../db/schema.js";

// Reviews and reports on marketplace templates. Rules live here (not in the routes) so they are tested against real SQL:
//  - only a tenant that INSTALLED a template can review it (one review each, editable; no review farming);
//  - any tenant can report a template, once while its previous report is still open;
//  - moderating a report can hide the template from the catalog.

export const REPORT_REASONS = [
  { key: "rusak", label: "File rusak / tidak tampil benar" },
  { key: "hak_cipta", label: "Melanggar hak cipta / merek" },
  { key: "tidak_pantas", label: "Konten tidak pantas" },
  { key: "menyesatkan", label: "Deskripsi menyesatkan" },
  { key: "lainnya", label: "Lainnya" },
] as const;
const REASON_KEYS: string[] = REPORT_REASONS.map((r) => r.key);

export type FeedbackError = "invalid" | "not_installed" | "not_found" | "duplicate" | "closed";
export type Result<T> = { ok: true; value: T } | { ok: false; error: FeedbackError; message: string };
const fail = (error: FeedbackError, message: string): { ok: false; error: FeedbackError; message: string } => ({ ok: false, error, message });

export interface RatingSummary { average: number; count: number }

/** Average rating (1 decimal) and count of published reviews, per template. Templates without reviews are absent. */
export async function ratingSummaries(ids?: string[]): Promise<Map<string, RatingSummary>> {
  const rows = await db.select({
    id: marketplaceReviews.marketplaceTemplateId,
    avg: sql<string>`round(avg(${marketplaceReviews.rating})::numeric, 1)`,
    n: sql<number>`count(*)::int`,
  }).from(marketplaceReviews)
    .where(ids ? and(eq(marketplaceReviews.status, "published"), inArray(marketplaceReviews.marketplaceTemplateId, ids)) : eq(marketplaceReviews.status, "published"))
    .groupBy(marketplaceReviews.marketplaceTemplateId);
  return new Map(rows.map((r) => [r.id, { average: Number(r.avg), count: r.n }]));
}

export async function hasInstalled(tenantId: string, templateId: string): Promise<boolean> {
  const [row] = await db.select({ id: templates.id }).from(templates).where(and(eq(templates.tenantId, tenantId), eq(templates.marketplaceTemplateId, templateId)));
  return Boolean(row);
}

export async function upsertReview(tenantId: string, templateId: string, ratingRaw: unknown, commentRaw: unknown): Promise<Result<{ id: string; created: boolean }>> {
  const rating = Number(ratingRaw);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail("invalid", "Beri bintang 1 sampai 5");
  const comment = typeof commentRaw === "string" ? commentRaw.trim() : "";
  if (comment.length > 600) return fail("invalid", "Ulasan maksimal 600 karakter");
  const [entry] = await db.select({ id: marketplaceTemplates.id }).from(marketplaceTemplates).where(and(eq(marketplaceTemplates.id, templateId), eq(marketplaceTemplates.active, true)));
  if (!entry) return fail("not_found", "Template tidak ditemukan");
  if (!(await hasInstalled(tenantId, templateId))) return fail("not_installed", "Pasang template ini dulu sebelum memberi ulasan");
  const [before] = await db.select({ id: marketplaceReviews.id }).from(marketplaceReviews).where(and(eq(marketplaceReviews.marketplaceTemplateId, templateId), eq(marketplaceReviews.tenantId, tenantId)));
  const [row] = await db.insert(marketplaceReviews).values({ marketplaceTemplateId: templateId, tenantId, rating, comment })
    .onConflictDoUpdate({ target: [marketplaceReviews.marketplaceTemplateId, marketplaceReviews.tenantId], set: { rating, comment, updatedAt: new Date() } })
    .returning({ id: marketplaceReviews.id });
  return { ok: true, value: { ...row, created: !before } };
}

export async function deleteOwnReview(tenantId: string, templateId: string) {
  await db.delete(marketplaceReviews).where(and(eq(marketplaceReviews.marketplaceTemplateId, templateId), eq(marketplaceReviews.tenantId, tenantId)));
}

export async function createReport(tenantId: string, templateId: string, reasonRaw: unknown, detailRaw: unknown): Promise<Result<{ id: string }>> {
  const reason = typeof reasonRaw === "string" ? reasonRaw : "";
  if (!REASON_KEYS.includes(reason)) return fail("invalid", "Pilih alasan pelaporan");
  const detail = typeof detailRaw === "string" ? detailRaw.trim() : "";
  if (detail.length > 800) return fail("invalid", "Keterangan maksimal 800 karakter");
  if (reason === "lainnya" && detail.length < 10) return fail("invalid", "Jelaskan masalahnya (minimal 10 karakter)");
  const [entry] = await db.select({ id: marketplaceTemplates.id }).from(marketplaceTemplates).where(eq(marketplaceTemplates.id, templateId));
  if (!entry) return fail("not_found", "Template tidak ditemukan");
  const [open] = await db.select({ id: marketplaceReports.id }).from(marketplaceReports)
    .where(and(eq(marketplaceReports.marketplaceTemplateId, templateId), eq(marketplaceReports.tenantId, tenantId), eq(marketplaceReports.status, "open")));
  if (open) return fail("duplicate", "Anda sudah melaporkan template ini; tim kami sedang meninjaunya");
  const [row] = await db.insert(marketplaceReports).values({ marketplaceTemplateId: templateId, tenantId, reason, detail }).returning({ id: marketplaceReports.id });
  return { ok: true, value: row };
}

export type ResolveAction = "hide" | "dismiss" | "resolve";

/** Close a report. `hide` also takes the template out of the catalog (installed copies are untouched) and closes every other open report on it. */
export async function resolveReport(reportId: string, action: ResolveAction, note: string, by: string | null): Promise<Result<{ templateId: string; closed: number }>> {
  const [report] = await db.select().from(marketplaceReports).where(eq(marketplaceReports.id, reportId));
  if (!report) return fail("not_found", "Laporan tidak ditemukan");
  if (report.status !== "open") return fail("closed", "Laporan ini sudah ditutup");
  const status = action === "dismiss" ? "dismissed" : "resolved";
  const resolution = (note.trim().slice(0, 500) || (action === "hide" ? "Template disembunyikan dari katalog" : action === "dismiss" ? "Laporan tidak terbukti" : "Ditangani")) ;
  const scope = action === "hide"
    ? and(eq(marketplaceReports.marketplaceTemplateId, report.marketplaceTemplateId), eq(marketplaceReports.status, "open"))
    : eq(marketplaceReports.id, reportId);
  if (action === "hide") await db.update(marketplaceTemplates).set({ active: false, updatedAt: new Date() }).where(eq(marketplaceTemplates.id, report.marketplaceTemplateId));
  const closed = await db.update(marketplaceReports).set({ status, resolution, resolvedBy: by, resolvedAt: new Date() }).where(scope).returning({ id: marketplaceReports.id });
  return { ok: true, value: { templateId: report.marketplaceTemplateId, closed: closed.length } };
}

export async function setReviewStatus(reviewId: string, status: "published" | "hidden"): Promise<boolean> {
  const rows = await db.update(marketplaceReviews).set({ status, updatedAt: new Date() }).where(eq(marketplaceReviews.id, reviewId)).returning({ id: marketplaceReviews.id });
  return rows.length > 0;
}
