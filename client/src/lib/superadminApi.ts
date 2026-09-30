import { getApiBaseUrl } from "./apiConfig";

// Deliberately separate from client/src/lib/api.ts's adminToken — a tenant-admin
// session and a superadmin session must never share a token variable, even if
// both happen to be open in the same browser tab.
const SUPERADMIN_TOKEN_KEY = "studiodo-superadmin-token";

let superadminToken: string | null = null;
try {
  superadminToken = sessionStorage.getItem(SUPERADMIN_TOKEN_KEY);
} catch {
  // sessionStorage can throw in private/locked-down contexts — superadmin just has to log in again.
}

export function getSuperadminToken() {
  return superadminToken;
}

export function setSuperadminToken(token: string | null) {
  superadminToken = token;
  try {
    if (token) sessionStorage.setItem(SUPERADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(SUPERADMIN_TOKEN_KEY);
  } catch {
    // ignore — token still works for the rest of this session via the in-memory variable
  }
}


// --- Marketing-website content (CMS) — schema comes from server/lib/siteContent.ts ---
export type SiteContentField =
  | { key: string; label: string; type: "text" | "textarea"; max?: number; hint?: string }
  | { key: string; label: string; type: "list"; itemLabel: string; itemFields: SiteContentField[]; maxItems?: number };
export type SiteContentSection = {
  key: string;
  label: string;
  description: string;
  fixed: boolean;
  fields: SiteContentField[];
  defaults: Record<string, unknown>;
  data: Record<string, unknown>;
  enabled: boolean;
  customized: boolean;
};

// --- Blog ---
export type BlogPostSummary = { id: string; slug: string; title: string; status: "draft" | "published"; publishedAt: string | null; updatedAt: string };
export type BlogPost = BlogPostSummary & { excerpt: string; body: string; author: string | null; createdAt: string };
export type BlogPostInput = { slug: string; title: string; excerpt: string; body: string; author: string | null; status: "draft" | "published" };

// --- Marketplace catalog ---
export type MarketplaceCategory = { key: string; label: string };
export type MarketplaceItem = {
  id: string; name: string; description: string; creatorName: string | null; category: string; orientation: string;
  imageUrl: string; canvasWidth: number; canvasHeight: number; slotCount: number; featured: boolean; installCount: number;
  active: boolean; createdAt: string;
};
export type MarketplaceSource = { id: string; name: string; category: string; orientation: string; imageUrl: string; slotCount: number; publishable: boolean };
export type MarketplaceMeta = { name?: string; description?: string; creatorName?: string | null; category?: string; featured?: boolean; active?: boolean };

export class SuperadminApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T | undefined> {
  const res = await fetch(`${getApiBaseUrl()}/superadmin${path}`, {
    ...options,
    // See client/src/lib/api.ts's request() for why — same Express ETag-without-
    // Cache-Control gap, same fix.
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(superadminToken ? { Authorization: `Bearer ${superadminToken}` } : {}),
      ...(options?.headers ?? {}),
    },
  });

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    if (!res.ok) throw new SuperadminApiError(res.status, `API error ${res.status}`);
    return undefined;
  }
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  if (res.status === 401 && body?.code === "superadmin_auth_required") {
    setSuperadminToken(null);
    // Same reasoning as client/src/lib/api.ts's "studiodo-admin-unauthorized" —
    // without this, the token is cleared but nothing tells the mounted dashboard
    // to show the login screen again: every add/edit/delete after this point
    // just 401s silently (or throws an unhandled rejection in whichever panel's
    // .then() has no .catch()), while the page keeps showing stale data as if
    // nothing were wrong.
    window.dispatchEvent(new Event("studiodo-superadmin-unauthorized"));
  }
  if (!res.ok) throw new SuperadminApiError(res.status, body?.error ?? `API error ${res.status}: ${text}`);
  return body as T;
}

// Business/registration profile fields — shared shape between a tenant row,
// the "Buat tenant" form, and a tenant application (the future public
// landing-page signup collects the same fields).
export interface TenantProfileFields {
  ownerName: string | null;
  ownerWhatsapp: string | null;
  businessType: string | null;
  city: string | null;
  address: string | null;
  website: string | null;
  instagramHandle: string | null;
  referralSource: string | null;
  internalNotes: string | null;
}

export interface SuperadminTenant extends TenantProfileFields {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  subscriptionEndsAt: string | null;
  createdAt: string;
  adminEmail: string | null;
  kioskCount: number;
  onlineKioskCount: number;
  sessionCount: number;
  revenue: number;
  locked: boolean;
  expiringSoon: boolean;
}

export interface PlatformSettings {
  id: string;
  defaultTrialDays: number;
  renewalWhatsapp: string | null;
  renewalCheckoutUrl: string | null;
  gracePeriodDays: number;
  updatedAt: string;
}

export interface PlatformOverview {
  tenants: { total: number; byStatus: Record<string, number>; expiringSoon: number; expired: number; locked: number };
  kiosks: { total: number; online: number };
  sessions: { total: number; paid: number; revenue: number };
}

export interface OverviewTimeseriesPoint {
  date: string;
  sessions: number;
  revenue: number;
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  price: string;
  billingInterval: "monthly" | "yearly";
  kioskLimit: number | null;
  screenBuilderEnabled: boolean;
  gifVideoEnabled: boolean;
  description: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface TenantPayment {
  id: string;
  tenantId: string;
  planId: string | null;
  planName: string | null;
  amount: string;
  method: string;
  periodDays: number;
  note: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface KioskDiagnostics { cameraOk: boolean; printerOk: boolean; networkOk: boolean; checkedAt: string }

export interface PlatformEvent {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  level: "info" | "warning" | "error";
  category: "tenant" | "billing" | "kiosk" | "auth" | "system";
  action: string;
  message: string;
  actorType: string | null;
  actorLabel: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TenantApplication {
  id: string;
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerWhatsapp: string | null;
  businessType: string | null;
  city: string | null;
  address: string | null;
  website: string | null;
  instagramHandle: string | null;
  referralSource: string | null;
  message: string | null;
  status: "pending" | "converted" | "rejected";
  convertedTenantId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface FleetAlertKiosk {
  id: string;
  tenantId: string;
  tenantName: string;
  label: string | null;
  lastUsedAt: string | null;
  lastDiagnostics: KioskDiagnostics | null;
  boundDeviceId: string | null;
}

export interface TenantDetail extends SuperadminTenant {
  admins: { id: string; email: string; createdAt: string }[];
  kioskKeys: { id: string; label: string | null; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; boundDeviceId: string | null; boundAt: string | null; appVersion: string | null; lastDiagnostics: KioskDiagnostics | null }[];
  payments: TenantPayment[];
  recentEvents: PlatformEvent[];
}

export const superadminApi = {
  login: (email: string, password: string) => request<{ token: string }>("/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>("/logout", { method: "POST" }),
  getMe: () => request<{ email: string }>("/me"),
  getTenants: () => request<SuperadminTenant[]>("/tenants"),
  getTenant: (id: string) => request<TenantDetail>(`/tenants/${id}`),
  getOverview: () => request<PlatformOverview>("/overview"),
  getOverviewTimeseries: (days = 30) => request<OverviewTimeseriesPoint[]>(`/overview/timeseries?days=${days}`),
  createTenant: (body: { name: string; slug: string; email: string; password: string; plan?: string } & Partial<TenantProfileFields>) =>
    request<{ tenant: SuperadminTenant; adminEmail: string; kioskKey: string; trialDays: number }>("/tenants", { method: "POST", body: JSON.stringify(body) }),
  updateTenant: (id: string, body: { plan?: string; status?: string; subscriptionEndsAt?: string | null } & Partial<TenantProfileFields>) =>
    request<SuperadminTenant>(`/tenants/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  extendTenant: (id: string, days: number) => request<SuperadminTenant>(`/tenants/${id}/extend`, { method: "POST", body: JSON.stringify({ days }) }),
  getSettings: () => request<PlatformSettings>("/settings"),
  updateSettings: (body: { defaultTrialDays?: number; renewalWhatsapp?: string; renewalCheckoutUrl?: string; gracePeriodDays?: number }) =>
    request<PlatformSettings>("/settings", { method: "PATCH", body: JSON.stringify(body) }),
  getPlans: () => request<Plan[]>("/plans"),
  createPlan: (body: { name: string; slug: string; price: number; billingInterval: "monthly" | "yearly"; kioskLimit: number | null; screenBuilderEnabled?: boolean; gifVideoEnabled?: boolean; description?: string; sortOrder?: number }) =>
    request<Plan>("/plans", { method: "POST", body: JSON.stringify(body) }),
  updatePlan: (id: string, body: Partial<{ name: string; price: number; billingInterval: "monthly" | "yearly"; kioskLimit: number | null; screenBuilderEnabled: boolean; gifVideoEnabled: boolean; description: string; sortOrder: number; active: boolean }>) =>
    request<Plan>(`/plans/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deletePlan: (id: string) => request<{ ok: boolean; deleted?: boolean; deactivated?: boolean }>(`/plans/${id}`, { method: "DELETE" }),
  getTenantPayments: (id: string) => request<TenantPayment[]>(`/tenants/${id}/payments`),
  recordPayment: (id: string, body: { amount: number; periodDays: number; method: string; note?: string; planId?: string | null }) =>
    request<{ tenant: SuperadminTenant; payment: TenantPayment }>(`/tenants/${id}/payments`, { method: "POST", body: JSON.stringify(body) }),

  getEvents: (filters: { level?: string; category?: string; tenantId?: string; before?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") params.set(key, String(value));
    const qs = params.toString();
    return request<PlatformEvent[]>(`/events${qs ? `?${qs}` : ""}`);
  },
  getFleetAlerts: () => request<{ offline: FleetAlertKiosk[]; diagnosticIssues: FleetAlertKiosk[] }>("/fleet-alerts"),

  getSiteContent: () => request<SiteContentSection[]>("/site-content"),
  saveSiteContent: (key: string, body: { data?: Record<string, unknown>; enabled?: boolean }) =>
    request<{ ok: boolean }>(`/site-content/${key}`, { method: "PUT", body: JSON.stringify(body) }),
  resetSiteContent: (key: string) => request<{ ok: boolean }>(`/site-content/${key}`, { method: "DELETE" }),
  reorderSiteContent: (keys: string[]) => request<{ ok: boolean }>("/site-content/order", { method: "PUT", body: JSON.stringify({ keys }) }),

  getMarketplace: () => request<{ categories: MarketplaceCategory[]; items: MarketplaceItem[] }>("/marketplace"),
  getMarketplaceSources: (tenantId: string) => request<MarketplaceSource[]>(`/marketplace/source-templates?tenantId=${encodeURIComponent(tenantId)}`),
  publishToMarketplace: (body: MarketplaceMeta & { fromTemplateId: string }) => request<MarketplaceItem>("/marketplace", { method: "POST", body: JSON.stringify(body) }),
  updateMarketplaceItem: (id: string, body: MarketplaceMeta) => request<MarketplaceItem>(`/marketplace/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteMarketplaceItem: (id: string) => request<{ ok: boolean }>(`/marketplace/${id}`, { method: "DELETE" }),

  getBlogPosts: () => request<BlogPostSummary[]>("/blog"),
  getBlogPost: (id: string) => request<BlogPost>(`/blog/${id}`),
  createBlogPost: (body: BlogPostInput) => request<BlogPost>("/blog", { method: "POST", body: JSON.stringify(body) }),
  updateBlogPost: (id: string, body: BlogPostInput) => request<BlogPost>(`/blog/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteBlogPost: (id: string) => request<{ ok: boolean }>(`/blog/${id}`, { method: "DELETE" }),

  getTenantApplications: (status: "pending" | "all" = "pending") => request<TenantApplication[]>(`/tenant-applications?status=${status}`),
  rejectApplication: (id: string, note?: string) => request<TenantApplication>(`/tenant-applications/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) }),
  convertApplication: (id: string, body: { slug: string; password: string }) =>
    request<{ tenant: SuperadminTenant; adminEmail: string; kioskKey: string; trialDays: number }>(`/tenant-applications/${id}/convert`, { method: "POST", body: JSON.stringify(body) }),
};
