import { getApiBaseUrl } from "./apiConfig";
import { tracked } from "./netActivity";

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

// Short-lived GET cache: opening a section a second time (or one the dashboard already warmed up) shows data instantly instead of
// waiting on a fresh round trip, and identical requests made at the same moment share one network call. Any write clears it so
// nothing stale survives an edit. Polling endpoints and CSV/other custom fetches do not go through here.
const GET_TTL_MS = 20_000;
const getCache = new Map<string, { at: number; promise: Promise<unknown> }>();

function request<T>(path: string, options?: RequestInit): Promise<T | undefined> {
  const method = (options?.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    getCache.clear();
    return rawRequest<T>(path, options);
  }
  if (/^\/(support|alerts)(\/|\?|$)/.test(path)) return rawRequest<T>(path, options); // live data: always fresh
  const key = `${superadminToken ?? ""}|${path}`;
  const hit = getCache.get(key);
  if (hit && Date.now() - hit.at < GET_TTL_MS) return hit.promise as Promise<T | undefined>;
  const promise = rawRequest<T>(path, options);
  getCache.set(key, { at: Date.now(), promise });
  promise.catch(() => { if (getCache.get(key)?.promise === promise) getCache.delete(key); });
  return promise;
}

/** Warm the cache for the screens people open most, right after login, so the first click is already answered. */
export function prefetchSuperadmin(paths: string[]) {
  for (const path of paths) void request(path).catch(() => undefined);
}

async function rawRequest<T>(path: string, options?: RequestInit): Promise<T | undefined> {
  const res = await tracked(() => fetch(`${getApiBaseUrl()}/superadmin${path}`, {
    ...options,
    // See client/src/lib/api.ts's request() for why — same Express ETag-without-
    // Cache-Control gap, same fix.
    cache: "no-store",
    headers: {
      ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(superadminToken ? { Authorization: `Bearer ${superadminToken}` } : {}),
      ...(options?.headers ?? {}),
    },
  }));

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
  if (!res.ok) {
    const missing = res.status === 404 && body?.error === undefined; // an unknown route, not a "not found" answered by our own handler
    throw new SuperadminApiError(res.status, missing ? "Fitur ini belum tersedia di server (server belum diperbarui)." : (body?.error ?? `API error ${res.status}: ${text.slice(0, 120)}`));
  }
  // A 200 that is not JSON (e.g. an HTML page served for an unknown path) is never a valid answer: fail loudly instead of leaving a spinner forever.
  if (text && body === undefined) throw new SuperadminApiError(res.status, "Server mengirim jawaban yang tidak dikenali — kemungkinan server belum diperbarui ke versi terbaru.");
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
  requiresApproval: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  holdUntil: string | null;
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

export interface PlatformDokuInfo {
  configured: boolean; clientId: string; hasSecret: boolean; environment: "sandbox" | "production"; qrisMode: "checkout" | "snap";
  merchantId: string; terminalId: string; postalCode: string; hasPrivateKey: boolean; snapReady: boolean; notificationUrl: string;
}

export interface WithdrawalPolicy {
  enabled: boolean;
  mode: "anytime" | "window";
  days: number[];
  fromTime: string;
  toTime: string;
  minAmount: number;
  maxAmount: number;
  dailyMaxAmount: number;
  dailyMaxCount: number;
  holdDays: number;
  cooldownHours: number;
  approvalThreshold: number;
  newAccountHoldHours: number;
  feePercent: number | null;
  flatFee: number | null;
}
export interface FinanceTenantRow {
  tenantId: string; name: string; frozen: boolean; hasOverride: boolean;
  gross: number; fee: number; onHold: number; adjustments: number; withdrawn: number; pending: number; openRequests: number; available: number; owed: number; lastPaymentAt: string | null;
}
export interface FinanceOverview {
  rules: { feePercent: number; minAmount: number; flatFee: number };
  totals: { tenants: number; gross: number; feesEarned: number; owed: number; available: number; onHold: number; awaitingPayout: number; paidOut: number; frozenTenants: number };
  items: FinanceTenantRow[];
  uncredited: { count: number; amount: number };
}
export interface LedgerRow { at: string; type: string; description: string; amount: number; fee: number; status: string; note: string | null; actor: string | null }
export interface FinanceUser { id: string; email: string; role: "owner" | "finance"; twoFactor: string | null; createdAt: string }

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

export interface TwoFactorStatus { enabled: boolean; enabledAt: string | null; recoveryCodesLeft: number; setupPending: boolean }

// ---- Bantuan tenant & Pusat Notifikasi ----
export interface SupportThread { id: string; tenantId: string; status: "open" | "resolved"; lastSender: "tenant" | "admin" | null; lastBody: string | null; lastMessageAt: string; tenantName: string; ownerName: string | null; ownerWhatsapp: string | null; unread: number; needsReply: boolean }
export interface SupportAttachment { url: string; name: string }
export interface SupportMessage { id: string; sender: "tenant" | "admin"; author: string | null; body: string; attachments?: SupportAttachment[]; caseId?: string | null; createdAt: string }
export type CaseStatus = "new" | "investigating" | "waiting" | "resolved" | "wontfix";
export type CasePriority = "low" | "normal" | "high" | "urgent";
export interface SupportCase {
  id: string; caseNo: number; tenantId: string; threadId: string | null; category: string; title: string; description: string; status: CaseStatus; priority: CasePriority;
  context: Record<string, string>; reportedBy: string | null; resolutionNote: string | null; createdAt: string; updatedAt: string; resolvedAt: string | null; tenantName: string;
}
export interface SupportCaseEvent { id: string; kind: string; actor: string | null; detail: string | null; createdAt: string }
export interface AdminAlert { id: string; kind: string; severity: "info" | "success" | "warning" | "critical"; title: string; body: string | null; link: string | null; tenantId: string | null; tenantName: string | null; readAt: string | null; waSentAt: string | null; waError: string | null; createdAt: string }
export interface AlertSummary { unread: number; critical: number; followUp: { key: string; label: string; count: number; link: string; tone: "warn" | "bad" | "info" }[]; followUpTotal: number }
export interface AlertSettings { number: string; gateway: boolean; kinds: { kind: string; label: string; severity: string; inApp: boolean; whatsapp: boolean }[] }

// ---- Calon tenant (CRM follow-up) ----
export type LeadStage = "new" | "contacted" | "trial_given" | "negotiation" | "contract_sent" | "active" | "lost";
export interface Lead {
  id: string; businessName: string; ownerName: string; ownerEmail: string; ownerWhatsapp: string | null; businessType: string | null; city: string | null;
  message: string | null; status: "pending" | "converted" | "rejected"; convertedTenantId: string | null; createdAt: string;
  pipelineStage: LeadStage; leadSource: string | null; lostReason: string | null; boothCount: number | null; boothLocation: string | null; plannedStart: string | null;
  paymentSetup: "own" | "platform" | null; planSlug: string | null; contractMonths: number | null; assignedTo: string | null; lastContactedAt: string | null;
  contractStatus: "none" | "draft" | "sent" | "signed"; contractSentAt: string | null; contractSignedAt: string | null; contractSignedName: string | null; hasContract: boolean;
  reviewNote: string | null; emailVerifiedAt?: string | null;
}
export type LeadTaskState = "done" | "overdue" | "today" | "upcoming";
export interface LeadTask { id: string; leadId: string; title: string; dueAt: string; doneAt: string | null; state: LeadTaskState }
export interface LeadListItem extends Lead { nextTask: { id: string; title: string; dueAt: string; state: LeadTaskState } | null; openTasks: number }
export interface LeadActivity { id: string; leadId: string; kind: "note" | "call" | "stage" | "whatsapp_out" | "whatsapp_in" | "contract" | "task" | "system"; body: string; meta: Record<string, unknown> | null; actor: string | null; createdAt: string }
export interface LeadContract { status: "draft" | "sent" | "signed"; number: string; url: string | null; sentAt: string | null; signedAt: string | null; signedName: string | null; warnings: string[]; total: number; html: string }
export interface LeadDetail { lead: Lead; activities: LeadActivity[]; tasks: LeadTask[]; contract: LeadContract | null }
export interface LeadSummary { funnel: { stage: LeadStage; label: string; count: number }[]; overdue: number; today: number; openLeads: number; withoutTask: number; contractsAwaiting: number }
export interface LeadTemplateRendered { key: string; label: string; stage: string; text: string; missing: string[]; waLink: string | null }
export interface LeadTemplateDef { key: string; label: string; stage: string; text: string }
export interface LeadSettings {
  whatsapp: { provider: "none" | "fonnte"; hasToken: boolean; hasWebhookKey: boolean; ready: boolean };
  templates: LeadTemplateDef[]; variables?: { key: string; label: string }[];
  issuer: { name: string; address: string; contact: string };
  publicBase?: string;
}
export type LeadInput = Partial<Pick<Lead, "businessName" | "ownerName" | "ownerEmail" | "ownerWhatsapp" | "businessType" | "city" | "leadSource" | "boothCount" | "boothLocation" | "plannedStart" | "paymentSetup" | "planSlug" | "contractMonths" | "assignedTo">>;

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = { new: "Baru", contacted: "Dihubungi", trial_given: "Trial diberikan", negotiation: "Negosiasi", contract_sent: "Kontrak terkirim", active: "Aktif", lost: "Batal" };
export const LEAD_STAGES: LeadStage[] = ["new", "contacted", "trial_given", "negotiation", "contract_sent", "active", "lost"];
export const LEAD_SOURCES = [["website", "Website"], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"], ["referral", "Rekomendasi"], ["event", "Event"], ["other", "Lainnya"]] as const;

export const superadminApi = {
  login: (email: string, password: string) => request<{ token?: string; twoFactorRequired?: boolean; challenge?: string }>("/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  /** Second sign-in step when 2FA is on: the challenge from login() plus a 6-digit authenticator code or a recovery code. */
  login2fa: (challenge: string, code: string) => request<{ token: string; usedRecoveryCode?: boolean }>("/login/2fa", { method: "POST", body: JSON.stringify({ challenge, code }) }),
  getTwoFactorStatus: () => request<TwoFactorStatus>("/2fa/status"),
  setupTwoFactor: () => request<{ secret: string; otpauthUrl: string }>("/2fa/setup", { method: "POST" }),
  enableTwoFactor: (code: string) => request<{ ok: boolean; recoveryCodes: string[] }>("/2fa/enable", { method: "POST", body: JSON.stringify({ code }) }),
  disableTwoFactor: (password: string, code: string) => request<{ ok: boolean }>("/2fa/disable", { method: "POST", body: JSON.stringify({ password, code }) }),
  regenerateRecoveryCodes: (code: string) => request<{ ok: boolean; recoveryCodes: string[] }>("/2fa/recovery-codes", { method: "POST", body: JSON.stringify({ code }) }),
  logout: () => request<{ ok: boolean }>("/logout", { method: "POST" }),
  getMe: () => request<{ email: string; role?: "owner" | "finance"; twoFactorEnabled?: boolean }>("/me"),
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
  approveWithdrawal: (id: string) => request<WithdrawalAdminRow>(`/withdrawals/${id}/approve`, { method: "POST" }),
  updateWithdrawal: (id: string, body: { status: "processing" | "paid" | "rejected"; adminNote?: string; transferReference?: string }) =>
    request<WithdrawalAdminRow>(`/withdrawals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  getTenantQrisBalance: (id: string) => request<TenantQrisBalance>(`/tenants/${id}/qris-balance`),
  getFinanceOverview: () => request<FinanceOverview>("/finance/overview"),
  getFinancePolicy: () => request<{ policy: WithdrawalPolicy; defaults: WithdrawalPolicy; rules: { feePercent: number; minAmount: number; flatFee: number }; summary: string }>("/finance/policy"),
  saveFinancePolicy: (policy: Partial<WithdrawalPolicy>) => request<{ policy: WithdrawalPolicy; summary: string }>("/finance/policy", { method: "PUT", body: JSON.stringify({ policy }) }),
  getTenantPolicy: (id: string) => request<{ name: string; settlement: string; override: Partial<WithdrawalPolicy>; effective: WithdrawalPolicy; summary: string }>(`/finance/tenants/${id}/policy`),
  saveTenantPolicy: (id: string, override: Partial<WithdrawalPolicy> | null) => request<{ override: Partial<WithdrawalPolicy>; effective: WithdrawalPolicy; summary: string }>(`/finance/tenants/${id}/policy`, { method: "PUT", body: JSON.stringify({ override }) }),
  getTenantLedger: (id: string) => request<{ name: string; balance: { available: number; onHold: number; pending: number; withdrawn: number; adjustments: number; grossIncome: number; platformFee: number }; rows: LedgerRow[] }>(`/finance/tenants/${id}/ledger`),
  adjustTenantBalance: (id: string, amount: number, note: string) => request<{ balance: { available: number } }>(`/finance/tenants/${id}/adjustments`, { method: "POST", body: JSON.stringify({ amount, note }) }),
  getReconcile: () => request<{ count: number; amount: number; items: { id: string; tenantId: string; amount: string; createdAt: string }[] }>("/finance/reconcile"),
  runReconcile: (tenantId?: string) => request<{ found: number; credited: number; amount: number }>("/finance/reconcile", { method: "POST", body: JSON.stringify({ tenantId }) }),
  getFinanceUsers: () => request<FinanceUser[]>("/finance/users"),
  createFinanceUser: (email: string, password: string) => request<FinanceUser>("/finance/users", { method: "POST", body: JSON.stringify({ email, password }) }),
  deleteFinanceUser: (id: string) => request<{ ok: boolean }>(`/finance/users/${id}`, { method: "DELETE" }),
  /** CSV files need the auth header, so they are fetched and saved from a blob instead of opened as a link. */
  downloadFinanceCsv: async (path: string, filename: string) => {
    const res = await fetch(`${getApiBaseUrl()}/superadmin${path}`, { cache: "no-store", headers: superadminToken ? { Authorization: `Bearer ${superadminToken}` } : {} });
    if (!res.ok) throw new SuperadminApiError(res.status, `Gagal mengunduh (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },
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

  getPlatformDoku: () => request<PlatformDokuInfo>("/payment-gateways/doku"),
  savePlatformDoku: (body: Record<string, unknown>) => request<PlatformDokuInfo>("/payment-gateways/doku", { method: "PUT", body: JSON.stringify(body) }),
  testPlatformDoku: () => request<{ ok: boolean; message: string }>("/payment-gateways/doku/test", { method: "POST" }),
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
    request<{ tenant: SuperadminTenant; adminEmail: string; kioskKey: string; trialDays: number; whatsappMessage?: string; whatsappLink?: string | null }>(`/tenant-applications/${id}/convert`, { method: "POST", body: JSON.stringify(body) }),

  // Calon tenant (CRM)
  getLeads: (q = "") => request<{ leads: LeadListItem[] }>(`/leads${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getLeadSummary: () => request<LeadSummary>("/leads/summary"),
  createLead: (body: LeadInput & { message?: string }) => request<Lead>("/leads", { method: "POST", body: JSON.stringify(body) }),
  getLead: (id: string) => request<LeadDetail>(`/leads/${id}`),
  updateLead: (id: string, body: LeadInput & { reviewNote?: string | null }) => request<Lead>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteLead: (id: string) => request<{ ok: boolean }>(`/leads/${id}`, { method: "DELETE" }),
  moveLead: (id: string, stage: LeadStage, reason?: string) => request<Lead>(`/leads/${id}/stage`, { method: "POST", body: JSON.stringify({ stage, reason }) }),
  addLeadNote: (id: string, body: string, kind: "note" | "call" = "note") => request<LeadActivity>(`/leads/${id}/notes`, { method: "POST", body: JSON.stringify({ body, kind }) }),
  addLeadTask: (id: string, body: { title: string; preset?: string; dueAt?: string }) => request<LeadTask>(`/leads/${id}/tasks`, { method: "POST", body: JSON.stringify(body) }),
  updateLeadTask: (id: string, taskId: string, body: { done?: boolean; preset?: string; dueAt?: string }) => request<LeadTask>(`/leads/${id}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteLeadTask: (id: string, taskId: string) => request<{ ok: boolean }>(`/leads/${id}/tasks/${taskId}`, { method: "DELETE" }),
  getLeadTemplates: (id: string) => request<{ templates: LeadTemplateRendered[]; gateway: boolean; phone: string | null }>(`/leads/${id}/templates`),
  sendLeadWhatsapp: (id: string, text: string, mode: "gateway" | "manual") => request<{ ok: boolean }>(`/leads/${id}/whatsapp`, { method: "POST", body: JSON.stringify({ text, mode }) }),
  buildLeadContract: (id: string) => request<{ ok: boolean; warnings: string[]; html: string; lead: Lead }>(`/leads/${id}/contract`, { method: "POST" }),
  sendLeadContract: (id: string) => request<{ ok: boolean; url: string; message: string; waLink: string | null }>(`/leads/${id}/contract/send`, { method: "POST", body: JSON.stringify({ reviewed: true }) }),
  markLeadContractSigned: (id: string, name?: string) => request<Lead>(`/leads/${id}/contract/mark-signed`, { method: "POST", body: JSON.stringify({ name }) }),
  getLeadSettings: () => request<LeadSettings>("/leads/settings/all"),
  saveLeadSettings: (body: { whatsapp?: { provider?: string; token?: string; clearToken?: boolean }; templates?: Record<string, string>; issuer?: LeadSettings["issuer"] }) => request<LeadSettings>("/leads/settings/all", { method: "PUT", body: JSON.stringify(body) }),
  rotateLeadWebhookKey: () => request<{ key: string; url: string }>("/leads/settings/webhook-key", { method: "POST" }),
  testLeadWhatsapp: (phone: string) => request<{ ok: boolean }>("/leads/settings/whatsapp-test", { method: "POST", body: JSON.stringify({ phone }) }),
  getLeadDoc: (which: "onboarding" | "team") => request<{ title: string; markdown: string; html: string; page: string; publicUrl: string | null }>(`/leads/docs/${which}`),
  // Bantuan tenant
  getSupportThreads: () => request<{ threads: SupportThread[]; needsReply: number; unread: number }>("/support/threads"),
  getSupportThread: (id: string) => request<{ thread: { id: string; tenantId: string; status: "open" | "resolved"; tenantName: string; ownerName: string | null; ownerWhatsapp: string | null; plan: string }; messages: SupportMessage[] }>(`/support/threads/${id}`),
  replySupport: (id: string, body: string, attachments: SupportAttachment[] = [], caseId?: string) =>
    request<SupportMessage>(`/support/threads/${id}/reply`, { method: "POST", body: JSON.stringify({ body, attachments, caseId }) }),
  uploadSupportImage: (threadId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<SupportAttachment>(`/support/threads/${threadId}/upload`, { method: "POST", body: form });
  },
  getSupportCases: (status = "open", category = "") => request<{ cases: SupportCase[]; open: number; total: number }>(`/support/cases?status=${encodeURIComponent(status)}${category ? `&category=${encodeURIComponent(category)}` : ""}`),
  getSupportCase: (id: string) => request<{ case: SupportCase; events: SupportCaseEvent[]; messages: SupportMessage[] }>(`/support/cases/${id}`),
  updateSupportCase: (id: string, body: { status?: CaseStatus; priority?: CasePriority; category?: string; note?: string; resolutionNote?: string }) =>
    request<{ ok: boolean; unchanged?: boolean }>(`/support/cases/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  setSupportStatus: (id: string, status: "open" | "resolved") => request<{ id: string; status: string }>(`/support/threads/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  // Pusat Notifikasi
  getAlerts: (opts: { unread?: boolean; kind?: string; limit?: number } = {}) => request<{ items: AdminAlert[]; unread: number; critical: number }>(`/alerts?limit=${opts.limit ?? 60}${opts.unread ? "&unread=1" : ""}${opts.kind ? `&kind=${encodeURIComponent(opts.kind)}` : ""}`),
  getAlertSummary: () => request<AlertSummary>("/alerts/summary"),
  impersonateTenant: (tenantId: string) => request<{ token: string; tenantName: string; adminEmail: string; expiresInMinutes: number }>(`/tenants/${tenantId}/impersonate`, { method: "POST", body: "{}" }),
  // Owner insights, search, morning summary
  getInsightsHealth: () => request<{ rows: TenantHealthRow[]; summary: { healthy: number; watch: number; risk: number } }>("/insights/health"),
  getInsightsRevenue: () => request<RevenueInsights>("/insights/revenue"),
  getInsightsFleet: () => request<{ latest: string | null; rows: FleetRow[] }>("/insights/fleet"),
  getInsightsAnomalies: () => request<{ items: AnomalyItem[] }>("/insights/anomalies"),
  getDigest: () => request<{ settings: DigestSettings; preview: string; gateway: boolean; hasNumber: boolean }>("/insights/digest"),
  saveDigest: (settings: DigestSettings) => request<{ settings: DigestSettings }>("/insights/digest", { method: "PUT", body: JSON.stringify(settings) }),
  sendDigestNow: () => request<{ text: string; whatsapp: "sent" | "no_gateway" | "no_number" | "failed"; error?: string }>("/insights/digest/send", { method: "POST", body: "{}" }),
  search: (q: string) => request<{ hits: SearchHit[] }>(`/search?q=${encodeURIComponent(q)}`),
  // WhatsApp to existing tenants (manual composer + automatic renewal reminders)
  getTenantWa: (tenantId: string) => request<TenantWaData>(`/tenant-wa/${tenantId}`),
  prepareTenantAccountMessage: (tenantId: string) => request<{ text: string; missing: string[]; waLink: string | null; includes: { email: string; hasKey: boolean; keyLabel: string | null; trialDays: number | null; setupLinkDays: number } }>(`/tenant-wa/${tenantId}/account-message`, { method: "POST", body: "{}" }),
  sendTenantWa: (tenantId: string, text: string, mode: "gateway" | "manual") => request<{ ok: true }>(`/tenant-wa/${tenantId}/send`, { method: "POST", body: JSON.stringify({ text, mode }) }),
  getTenantWaOverview: () => request<TenantWaOverview>("/tenant-wa/overview"),
  saveTenantWaAuto: (auto: TenantWaAuto) => request<{ auto: TenantWaAuto; warning?: string }>("/tenant-wa/auto", { method: "PUT", body: JSON.stringify(auto) }),
  markAlertsRead: (body: { ids: string[] } | { all: true }) => request<{ unread: number; critical: number }>("/alerts/read", { method: "POST", body: JSON.stringify(body) }),
  getAlertSettings: () => request<AlertSettings>("/alerts/settings"),
  saveAlertSettings: (body: { number?: string; prefs?: Record<string, { inApp?: boolean; whatsapp?: boolean }> }) => request<{ ok: boolean }>("/alerts/settings", { method: "PUT", body: JSON.stringify(body) }),
  testAlertWhatsapp: () => request<{ ok: boolean }>("/alerts/test", { method: "POST" }),
};

// ---- Konten Instagram (Content Studio) ----
export type CsMockup = "none" | "dashboard" | "macbook" | "qris" | "gallery" | "booth" | "queue" | "hub" | "strip" | "qris-l" | "booth-l" | "gallery-l" | "print-l";
export type CsSlideKind = "cover" | "feature" | "steps" | "stat" | "compare" | "cta" | "badge" | "hook" | "chat" | "note";
export type CsTone = "light" | "dark" | "indigo" | "mint" | "peach";
export type CsSlide = {
  kind: CsSlideKind; tone?: CsTone; eyebrow?: string; title: string; body?: string; mockup?: CsMockup; note?: string;
  items?: string[]; itemsBefore?: string[]; labelBefore?: string; labelAfter?: string; stat?: { value: number; suffix?: string; prefix?: string; label: string };
  images?: string[]; bgImage?: string; icon?: string; emoji?: string; chat?: { from: "them" | "us"; text: string }[]; seconds?: number;
};
export type CsDeck = { id: string; title: string; format: "carousel" | "reel" | "highlight"; tone: CsTone; handle: string; caption: string; hashtags: string[]; slides: CsSlide[]; builtin?: boolean; updatedAt?: string };
export type CsIdea = { pillar: string; title: string; hook: string; format: "carousel" | "reel"; source: string; deckId?: string };
export type CsJob = { id: string; deckId: string; mode: "png" | "mp4" | "mp4-slides" | "trio-png" | "trio-mp4" | "icon" | "teaser"; status: "running" | "done" | "error"; progress: number; label: string; files: { name: string; size: number }[]; error?: string };

export type HealthLevel = "healthy" | "watch" | "risk";
export interface TenantHealthRow { tenantId: string; name: string; status: string; ownerWhatsapp: string | null; score: number; level: HealthLevel; reasons: string[]; sessions30: number; keys: number; online: number; licence: "ok" | "ending" | "expired" | "none" }
export interface RevenueInsights {
  mrr: number; revenue30: number; revenuePrev30: number; payingTenants: number; newPaying30: number; churned30: number;
  monthly: { month: string; revenue: number }[];
  funnel: { trialsIssued: number; activated: number; used: number; converted: number; expiredUnconverted: number };
}
export interface FleetRow { keyId: string; label: string | null; tenantId: string; tenantName: string; version: string | null; outdated: boolean; online: boolean; lastUsedAt: string | null; issues: string[]; autoUpdate: boolean; licenceType: string; licenceEndsAt: string | null }
export interface AnomalyItem { kind: string; severity: "warning" | "critical"; tenantId: string | null; tenantName: string | null; message: string }
export interface DigestSettings { enabled: boolean; hour: number }
export interface SearchHit { type: "tenant" | "lead" | "admin" | "booth"; id: string; title: string; subtitle: string; tenantId?: string }

export type TenantWaStage ="d7" | "d3" | "d1" | "expired";
export interface TenantWaAuto { enabled: boolean; stages: TenantWaStage[] }
export interface TenantWaData {
  tenant: { id: string; name: string; ownerName: string | null }; phone: string | null; gateway: boolean; licenceStage: TenantWaStage | null;
  templates: { key: string; label: string; text: string; missing: string[]; waLink: string | null }[];
  history: { id: string; action: string; message: string; actor: string | null; at: string; metadata: Record<string, unknown> | null }[];
}
export interface TenantWaOverview {
  gateway: boolean; auto: TenantWaAuto; sendingNow: boolean;
  upcoming: { tenantId: string; name: string; stage: TenantWaStage; kind: "trial" | "paid"; booths: number; endsAt: string; phone: string | null; sent: boolean }[];
}

export type CsPlanStatus ="ide" | "draf" | "siap" | "terjadwal" | "terposting";
export type CsPlanItem = { id: string; title: string; phase: string; pillar: string; format: "carousel" | "reel" | "story"; deckId?: string; date?: string; time?: string; status: CsPlanStatus; checks: string[]; notes?: string };
export type CsPlan = { startDate: string; days: number[]; time: string; items: CsPlanItem[]; profileChecks: string[]; updatedAt?: string };

export type CsTriptych = { seam: "panorama" | "grid"; logoStyle: "silver" | "squircle-white" | "squircle-dark"; comingTitle: string; comingSub: string; headline: string; features: string; cta: string };

export type CsTeaser = { logoStyle: "silver" | "squircle-white" | "squircle-dark"; comingTitle: string; beats: string; headline: string; features: string; cta: string };

export const contentStudioApi = {
  teaserPreview: (options: CsTeaser) => request<{ html: string }>("/content-studio/teaser/preview", { method: "POST", body: JSON.stringify({ options }) }),
  teaserRender: (options: CsTeaser) => request<CsJob>("/content-studio/teaser/render", { method: "POST", body: JSON.stringify({ options }) }),
  iconPreview: () => request<{ html: string }>("/content-studio/icon/preview"),
  iconRender: () => request<CsJob>("/content-studio/icon/render", { method: "POST" }),
  triptychDefaults: () => request<CsTriptych>("/content-studio/triptych/defaults"),
  triptychPreview: (options: CsTriptych) => request<{ html: string }>("/content-studio/triptych/preview", { method: "POST", body: JSON.stringify({ options }) }),
  triptychRender: (options: CsTriptych, mode: "png" | "mp4") => request<CsJob>("/content-studio/triptych/render", { method: "POST", body: JSON.stringify({ options, mode }) }),
  plan: () => request<CsPlan>("/content-studio/plan"),
  savePlan: (plan: CsPlan) => request<CsPlan>("/content-studio/plan", { method: "PUT", body: JSON.stringify(plan) }),
  reschedule: (plan: CsPlan, opts: { startDate: string; days: number[]; time: string }) => request<CsPlan>("/content-studio/plan/reschedule", { method: "POST", body: JSON.stringify({ plan, ...opts }) }),
  status: () => request<{ chrome: string | null; ffmpeg: boolean }>("/content-studio/status"),
  decks: () => request<CsDeck[]>("/content-studio/decks"),
  ideas: () => request<CsIdea[]>("/content-studio/ideas"),
  saveDeck: (deck: CsDeck) => request<CsDeck>(`/content-studio/decks/${encodeURIComponent(deck.id)}`, { method: "PUT", body: JSON.stringify(deck) }),
  deleteDeck: (id: string) => request<{ ok: boolean }>(`/content-studio/decks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  preview: (deck: CsDeck, index: number) => request<{ html: string }>("/content-studio/preview", { method: "POST", body: JSON.stringify({ deck, index }) }),
  render: (deck: CsDeck, mode: "png" | "mp4" | "mp4-slides") => request<CsJob>("/content-studio/render", { method: "POST", body: JSON.stringify({ deck, mode }) }),
  job: (id: string) => request<CsJob>(`/content-studio/jobs/${id}`),
  uploadAsset: (name: string, dataUrl: string) => request<{ name: string }>("/content-studio/assets", { method: "POST", body: JSON.stringify({ name, dataUrl }) }),
  /** Downloads need the Bearer header, so fetch as a blob and click a temporary link. */
  async download(jobId: string, name: string) {
    const res = await fetch(`${getApiBaseUrl()}/superadmin/content-studio/jobs/${jobId}/files/${encodeURIComponent(name)}`, {
      headers: superadminToken ? { Authorization: `Bearer ${superadminToken}` } : {},
    });
    if (!res.ok) throw new Error("Gagal mengunduh file");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};
