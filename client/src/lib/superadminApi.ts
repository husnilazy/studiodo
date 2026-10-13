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
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; hint?: string }
  | { key: string; label: string; type: "image"; hint?: string }
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
export type BlogPostSummary = { id: string; slug: string; title: string; status: "draft" | "published"; category: string; position: number | null; publishedAt: string | null; updatedAt: string };
export type BlogPost = BlogPostSummary & { excerpt: string; body: string; author: string | null; coverUrl: string | null; createdAt: string };
export type BlogPostInput = { slug: string; title: string; excerpt: string; body: string; author: string | null; category: string; coverUrl: string | null; position: number | null; status: "draft" | "published" };
export const BLOG_CATEGORIES = ["Panduan", "Tips Bisnis", "Informasi", "Rilis"] as const;

// --- Marketplace catalog ---
export type MarketplaceCategory = { key: string; label: string };
export type MarketplaceItem = {
  id: string; name: string; description: string; creatorName: string | null; category: string; orientation: string;
  imageUrl: string; canvasWidth: number; canvasHeight: number; slotCount: number; featured: boolean; installCount: number;
  active: boolean; createdAt: string;
  ratingAverage?: number | null; ratingCount?: number; openReports?: number;
};
export type MarketplaceSource = { id: string; name: string; category: string; orientation: string; imageUrl: string; slotCount: number; publishable: boolean };
export type MarketplaceMeta = { name?: string; description?: string; creatorName?: string | null; category?: string; featured?: boolean; active?: boolean };

// --- Creator applications ---
export type CreatorSubmission = {
  id: string; name: string; email: string; whatsapp: string | null; portfolioUrl: string; description: string;
  emailVerifiedAt?: string | null; status: "new" | "reviewing" | "accepted" | "rejected"; note: string | null; reviewedBy: string | null; reviewedAt: string | null; createdAt: string;
};

// --- Subscription payment gateways (Midtrans / Xendit) ---
export type GatewayInfo = {
  provider: "midtrans" | "xendit";
  label: string;
  enabled: boolean;
  priority: number;
  environment: "sandbox" | "production";
  hasKey: boolean;
  keySource: "database" | "environment" | "none";
  keyTail: string | null;
  hasWebhookToken: boolean;
  needsWebhookToken: boolean;
  webhookUrl: string;
  lastTest: { at: string; ok: boolean; message: string } | null;
  lastWebhook: { at: string; result: string } | null;
  orders30d: { paid: number; pending: number; failed: number; expired: number };
};
export type GatewaysOverview = { gateways: GatewayInfo[]; checkoutOrder: string[]; whatsappFallback: boolean };
export type GatewayPatch = {
  enabled?: boolean; priority?: number; environment?: "sandbox" | "production";
  secretKey?: string; clearSecretKey?: boolean; webhookToken?: string; clearWebhookToken?: boolean;
};

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
  qrisSettlement?: "direct" | "platform";
  sessionCount: number;
  revenue: number;
  locked: boolean;
  expiringSoon: boolean;
  /** Per-booth licence picture of this tenant. */
  licenses?: LicenseSummary;
  boothDiscountPercent?: number;
  boothDiscountNote?: string | null;
}

export interface LicenseSummary {
  activeKeys: number; paid: number; trial: number; unpaid: number; locked: number; expiringSoon: number; nearestEndsAt: string | null;
}

export type LicenseType = "trial" | "paid" | "unpaid";

/** One booth (kiosk key) with its licence, across all tenants. */
export interface LicenseRow {
  id: string;
  label: string | null;
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  licenseType: LicenseType;
  licenseEndsAt: string | null;
  licensePlanSlug: string | null;
  trialStartedAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  appVersion: string | null;
  revokedAt: string | null;
  paired: boolean;
  locked: boolean;
  lockReason: "suspended" | "unpaid" | "trial_expired" | "expired" | null;
  daysRemaining: number | null;
  graceDaysRemaining: number | null;
  expiringSoon: boolean;
}

export interface VolumeTier { minBooths: number; percent: number }

export interface SecurityAlert {
  id: string; createdAt: string; message: string; tenantId: string | null; email: string | null; ip: string | null;
  lockMinutes: number; lockoutCount: number; tenantName: string | null; ownerName: string | null; ownerWhatsapp: string | null;
}

export type NotificationSeverity = "info" | "success" | "warning" | "critical";
export type NotificationKind = "platform" | "customer_message" | "billing" | "booth" | "system";
export interface SentNotification {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  linkUrl: string | null;
  createdBy: string | null;
  expiresAt: string | null;
  createdAt: string;
  readCount: number;
}
export interface SendNotificationInput { tenantId: string | null; title: string; body?: string; severity: NotificationSeverity; kind?: NotificationKind; linkUrl?: string; expiresInDays?: number }

export interface PlatformSettings {
  id: string;
  defaultTrialDays: number;
  renewalWhatsapp: string | null;
  renewalCheckoutUrl: string | null;
  gracePeriodDays: number;
  qrisFeePercent: string;
  withdrawalMinAmount: number;
  withdrawalFlatFee: number;
  volumeDiscounts: VolumeTier[];
  updatedAt: string;
}

export interface WithdrawalAdminRow {
  id: string;
  tenantId: string;
  tenantName: string;
  amount: string;
  feeAmount: string;
  netAmount: string;
  status: "pending" | "processing" | "paid" | "rejected";
  bankName: string;
  accountNumber: string;
  accountName: string;
  requestNote: string | null;
  adminNote: string | null;
  transferReference: string | null;
  requestedBy: string | null;
  processedBy: string | null;
  requestedAt: string;
  processedAt: string | null;
}
export interface WithdrawalAdminList {
  items: WithdrawalAdminRow[];
  summary: { open: number; openAmount: number; paidAmount: number };
}
export interface TenantQrisBalance {
  settlement: "direct" | "platform";
  since: string | null;
  grossIncome: number;
  platformFee: number;
  netIncome: number;
  withdrawn: number;
  pending: number;
  available: number;
  paymentCount: number;
}

export interface PlatformOverview {
  tenants: { total: number; byStatus: Record<string, number>; expiringSoon: number; expired: number; locked: number };
  booths?: { total: number; paid: number; trial: number; unpaid: number; locked: number; expiringSoon: number };
  kiosks: { total: number; online: number };
  sessions: { total: number; paid: number; revenue: number };
  subscriptions: { revenue30d: number; payments30d: number; pendingOrders: number };
}

export interface BillingOrderRow {
  orderId: string; provider: string; tenantId: string; tenantName: string; planName: string; amount: number; periodDays: number;
  status: "pending" | "paid" | "failed" | "expired"; paymentType: string | null; createdAt: string; paidAt: string | null;
  boothCount?: number; discountPercent?: number;
}

export interface CreatorAccount {
  id: string; name: string; email: string; whatsapp: string | null; status: "active" | "suspended";
  lastLoginAt: string | null; createdAt: string; templateCount: number;
}

export interface CreatorTemplateReview {
  id: string; name: string; description: string; category: string; orientation: string; outputPreset: string;
  canvasWidth: number; canvasHeight: number; slots: { x: number; y: number; w: number; h: number; rotation?: number }[];
  frameUrl: string | null; status: "draft" | "pending" | "approved" | "rejected"; reviewNote: string | null;
  submittedAt: string | null; reviewedAt: string | null; creatorName: string; creatorEmail: string;
  creatorId?: string; creatorWhatsapp?: string | null; creatorStats?: { approved: number; rejected: number; total: number };
  waitingDays?: number | null; checks?: ReviewCheck[];
}
export interface MarketReportRow {
  id: string; status: "open" | "resolved" | "dismissed"; reason: string; detail: string; resolution: string | null; resolvedBy: string | null; resolvedAt: string | null; createdAt: string;
  templateId: string; templateName: string; templateActive: boolean; creatorName: string | null; imageUrl: string;
  tenantId: string; tenantName: string; tenantWhatsapp: string | null; tenantOwner: string | null;
}
export interface MarketReviewRow { id: string; rating: number; comment: string; status: "published" | "hidden"; createdAt: string; templateId: string; templateName: string; tenantName: string }
export interface EmailLogRow { id: string; toEmail: string; subject: string; kind: string; status: "sent" | "failed" | "skipped"; error: string | null; createdAt: string; tenantId: string | null; tenantName: string | null }
export interface EmailSummary { configured: boolean; from: string; last7Days: { sent: number; failed: number; skipped: number } }
export interface ReviewCheck { id: string; label: string; status: "ok" | "warn" | "fail"; detail: string }
export interface ModerationLogEntry { id: string; createdAt: string; action: string; message: string; actorLabel: string | null }

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
  discountPercent: number;
  discountLabel: string | null;
  discountEndsAt: string | null;
  yearlyDiscountPercent: number;
  featured: boolean;
  features: string[];
  createdAt: string;
}

export interface PlanInput {
  name: string;
  slug: string;
  price: number;
  billingInterval: "monthly" | "yearly";
  kioskLimit: number | null;
  screenBuilderEnabled: boolean;
  gifVideoEnabled: boolean;
  description: string;
  sortOrder: number;
  active: boolean;
  discountPercent: number;
  discountLabel: string;
  discountEndsAt: string | null;
  yearlyDiscountPercent: number;
  featured: boolean;
  features: string[];
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
  emailVerifiedAt?: string | null;
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
  kioskKeys: { id: string; label: string | null; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; boundDeviceId: string | null; boundAt: string | null; appVersion: string | null; lastDiagnostics: KioskDiagnostics | null; licenseType: LicenseType; licenseEndsAt: string | null; locked: boolean; lockReason: string | null; daysRemaining: number | null }[];
  payments: TenantPayment[];
  recentEvents: PlatformEvent[];
}

export const superadminApi = {
  login: (email: string, password: string) => request<{ token: string }>("/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>("/logout", { method: "POST" }),
  getMe: () => request<{ email: string }>("/me"),
  getTenants: () => request<SuperadminTenant[]>("/tenants"),
  getTenant: (id: string) => request<TenantDetail>(`/tenants/${id}`),
  recheckBillingOrder: (orderId: string) => request<{ ok: boolean; status: string; result: string }>(`/billing/orders/${encodeURIComponent(orderId)}/check`, { method: "POST" }),

  // --- Per-booth licences & trial keys ---
  getLicenses: (filters: { type?: string; state?: string; tenantId?: string; q?: string } = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return request<LicenseRow[]>(`/licenses${params.toString() ? `?${params.toString()}` : ""}`);
  },
  issueLicenseKey: (tenantId: string, body: { kind: LicenseType; days?: number; label?: string; planSlug?: string }) =>
    request<{ id: string; label: string | null; licenseType: LicenseType; licenseEndsAt: string | null; key: string }>(`/licenses/tenants/${tenantId}/keys`, { method: "POST", body: JSON.stringify(body) }),
  updateLicense: (id: string, body: { label?: string; licenseType?: LicenseType; licenseEndsAt?: string | null; extendDays?: number; planSlug?: string | null }) =>
    request<unknown>(`/licenses/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  resetLicenseDevice: (id: string) => request<{ ok: boolean }>(`/licenses/${id}/reset-device`, { method: "POST" }),
  revokeLicense: (id: string) => request<{ ok: boolean }>(`/licenses/${id}/revoke`, { method: "POST" }),
  restoreLicense: (id: string) => request<{ ok: boolean }>(`/licenses/${id}/restore`, { method: "POST" }),
  revealLicenseKey: (id: string) => request<{ key: string }>(`/licenses/${id}/key`),

  getBillingOrders: (status = "") => request<BillingOrderRow[]>(`/billing/orders${status ? `?status=${status}` : ""}`),
  getOverview: () => request<PlatformOverview>("/overview"),
  getOverviewTimeseries: (days = 30) => request<OverviewTimeseriesPoint[]>(`/overview/timeseries?days=${days}`),
  createTenant: (body: { name: string; slug: string; email: string; password: string; plan?: string; trialDays?: number } & Partial<TenantProfileFields>) =>
    request<{ tenant: SuperadminTenant; adminEmail: string; kioskKey: string; trialDays: number }>("/tenants", { method: "POST", body: JSON.stringify(body) }),
  updateTenant: (id: string, body: { plan?: string; status?: string; subscriptionEndsAt?: string | null; qrisSettlement?: "direct" | "platform"; boothDiscountPercent?: number; boothDiscountNote?: string | null } & Partial<TenantProfileFields>) =>
    request<SuperadminTenant>(`/tenants/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  extendTenant: (id: string, days: number, keyIds?: string[]) => request<SuperadminTenant>(`/tenants/${id}/extend`, { method: "POST", body: JSON.stringify({ days, keyIds }) }),
  getSettings: () => request<PlatformSettings>("/settings"),
  updateSettings: (body: { defaultTrialDays?: number; renewalWhatsapp?: string; renewalCheckoutUrl?: string; gracePeriodDays?: number; qrisFeePercent?: number; withdrawalMinAmount?: number; withdrawalFlatFee?: number; volumeDiscounts?: VolumeTier[] }) =>
    request<PlatformSettings>("/settings", { method: "PATCH", body: JSON.stringify(body) }),
  getWithdrawals: (status = "open") => request<WithdrawalAdminList>(`/withdrawals?status=${status}`),
  updateWithdrawal: (id: string, body: { status: "processing" | "paid" | "rejected"; adminNote?: string; transferReference?: string }) =>
    request<WithdrawalAdminRow>(`/withdrawals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  getTenantQrisBalance: (id: string) => request<TenantQrisBalance>(`/tenants/${id}/qris-balance`),
  getPlans: () => request<Plan[]>("/plans"),
  createPlan: (body: Partial<PlanInput> & Pick<PlanInput, "name" | "slug" | "price" | "billingInterval" | "kioskLimit">) =>
    request<Plan>("/plans", { method: "POST", body: JSON.stringify(body) }),
  updatePlan: (id: string, body: Partial<Omit<PlanInput, "slug">>) =>
    request<Plan>(`/plans/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deletePlan: (id: string) => request<{ ok: boolean; deleted?: boolean; deactivated?: boolean }>(`/plans/${id}`, { method: "DELETE" }),
  getTenantPayments: (id: string) => request<TenantPayment[]>(`/tenants/${id}/payments`),
  recordPayment: (id: string, body: { amount: number; periodDays: number; method: string; note?: string; planId?: string | null; keyIds?: string[] }) =>
    request<{ tenant: SuperadminTenant; payment: TenantPayment }>(`/tenants/${id}/payments`, { method: "POST", body: JSON.stringify(body) }),

  getEvents: (filters: { level?: string; category?: string; tenantId?: string; before?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") params.set(key, String(value));
    const qs = params.toString();
    return request<PlatformEvent[]>(`/events${qs ? `?${qs}` : ""}`);
  },
  getNotifications: () => request<{ items: SentNotification[]; tenantCount: number }>("/notifications"),
  sendNotification: (body: SendNotificationInput) => request<SentNotification>("/notifications", { method: "POST", body: JSON.stringify(body) }),
  deleteNotification: (id: string) => request<{ ok: boolean }>(`/notifications/${id}`, { method: "DELETE" }),
  getSecurityAlerts: () => request<SecurityAlert[]>("/security-alerts"),
  getFleetAlerts: () => request<{ offline: FleetAlertKiosk[]; diagnosticIssues: FleetAlertKiosk[] }>("/fleet-alerts"),

  getPaymentGateways: () => request<GatewaysOverview>("/payment-gateways"),
  savePaymentGateway: (provider: string, body: GatewayPatch) =>
    request<GatewayInfo>(`/payment-gateways/${provider}`, { method: "PUT", body: JSON.stringify(body) }),
  testPaymentGateway: (provider: string) =>
    request<{ ok: boolean; message: string }>(`/payment-gateways/${provider}/test`, { method: "POST" }),
  uploadSiteAsset: (filename: string, dataBase64: string) =>
    request<{ id: string; url: string }>("/assets", { method: "POST", body: JSON.stringify({ filename, dataBase64 }) }),
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

  getCreatorSubmissions: () => request<CreatorSubmission[]>("/creators"),
  updateCreatorSubmission: (id: string, body: { status?: CreatorSubmission["status"]; note?: string }) =>
    request<CreatorSubmission>(`/creators/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  getCreatorAccounts: () => request<CreatorAccount[]>("/creators/accounts"),
  createCreatorAccount: (body: { submissionId?: string; name?: string; email?: string; whatsapp?: string }) =>
    request<{ creator: { id: string; name: string; email: string }; password: string }>("/creators/accounts", { method: "POST", body: JSON.stringify(body) }),
  setCreatorAccountStatus: (id: string, status: "active" | "suspended", hidePublished = false) =>
    request<{ ok: boolean; hidden?: number }>(`/creators/accounts/${id}`, { method: "PATCH", body: JSON.stringify({ status, hidePublished }) }),
  getMarketReports: (status = "open") => request<{ reasons: { key: string; label: string }[]; items: MarketReportRow[] }>(`/marketplace/reports?status=${status}`),
  getMarketReportsSummary: () => request<{ open: number }>("/marketplace/reports/summary"),
  resolveMarketReport: (id: string, action: "hide" | "dismiss" | "resolve", note: string) =>
    request<{ ok: boolean; closed: number }>(`/marketplace/reports/${id}/resolve`, { method: "POST", body: JSON.stringify({ action, note }) }),
  getMarketReviews: () => request<MarketReviewRow[]>("/marketplace/reviews"),
  setMarketReviewStatus: (id: string, status: "published" | "hidden") =>
    request<{ ok: boolean }>(`/marketplace/reviews/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  getEmailSummary: () => request<EmailSummary>("/email-log/summary"),
  getEmailLog: (status = "", q = "") => request<EmailLogRow[]>(`/email-log?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) }).toString()}`),
  sendTestEmail: () => request<{ ok: boolean; to: string }>("/email-log/test", { method: "POST" }),
  getCreatorQueueSummary: () => request<{ pending: number; oldestWaitingDays: number | null; rejectionPresets: string[] }>("/creators/templates/summary"),
  getModerationLog: () => request<ModerationLogEntry[]>("/creators/moderation-log"),
  resetCreatorPassword: (id: string) => request<{ password: string }>(`/creators/accounts/${id}/reset-password`, { method: "POST" }),
  getCreatorTemplates: (status = "") => request<CreatorTemplateReview[]>(`/creators/templates${status ? `?status=${status}` : ""}`),
  approveCreatorTemplate: (id: string, featured = false) =>
    request<{ ok: boolean }>(`/creators/templates/${id}/approve`, { method: "POST", body: JSON.stringify({ featured }) }),
  rejectCreatorTemplate: (id: string, note: string) =>
    request<{ ok: boolean }>(`/creators/templates/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) }),
  deleteCreatorSubmission: (id: string) => request<{ ok: boolean }>(`/creators/${id}`, { method: "DELETE" }),

  getBlogPosts: () => request<BlogPostSummary[]>("/blog"),
  getBlogPost: (id: string) => request<BlogPost>(`/blog/${id}`),
  createBlogPost: (body: BlogPostInput) => request<BlogPost>("/blog", { method: "POST", body: JSON.stringify(body) }),
  updateBlogPost: (id: string, body: BlogPostInput) => request<BlogPost>(`/blog/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteBlogPost: (id: string) => request<{ ok: boolean }>(`/blog/${id}`, { method: "DELETE" }),

  getTenantApplications: (status: "pending" | "all" = "pending") => request<TenantApplication[]>(`/tenant-applications?status=${status}`),
  rejectApplication: (id: string, note?: string) => request<TenantApplication>(`/tenant-applications/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) }),
  convertApplication: (id: string, body: { slug: string; password: string; trialDays?: number }) =>
    request<{ tenant: SuperadminTenant; adminEmail: string; kioskKey: string; trialDays: number }>(`/tenant-applications/${id}/convert`, { method: "POST", body: JSON.stringify(body) }),
};
