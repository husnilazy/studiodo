import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  numeric,
  index,
  unique,
  customType,
} from "drizzle-orm/pg-core";

// Postgres bytea <-> Node Buffer (drizzle has no built-in bytea column).
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

// Root of multi-tenancy — one row per photobooth business.
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"), // 'active' | 'suspended' | 'trial' — not enforced yet
  plan: text("plan").notNull().default("free"), // placeholder for future billing
  // Subscription/billing awareness (Fase 2) — null means never set (pre-existing
  // tenants from before this feature). Purely informational: nothing in the kiosk
  // or admin API checks this to block access. Set/extended only by a superadmin.
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  // Business/registration profile — captured today via the superadmin's "Buat
  // tenant" form, and designed to be filled straight from a future public
  // landing-page signup form (see tenantApplications below) without a schema
  // change once that page exists. All nullable: every pre-existing tenant
  // simply has none of this yet.
  ownerName: text("owner_name"),
  ownerWhatsapp: text("owner_whatsapp"),
  businessType: text("business_type"), // e.g. 'photobooth_rental' | 'event_organizer' | 'studio' | 'other'
  city: text("city"),
  address: text("address"),
  website: text("website"),
  instagramHandle: text("instagram_handle"),
  referralSource: text("referral_source"), // "how did you hear about us"
  internalNotes: text("internal_notes"), // superadmin-only, never shown to the tenant
  // Public booth directory (website /booth). Strictly opt-in: nothing about a tenant is public until
  // the tenant itself turns `directoryListed` on from the web portal. Contact WhatsApp is a separate
  // opt-in because it exposes a phone number.
  directoryListed: boolean("directory_listed").notNull().default(false),
  directoryDescription: text("directory_description"),
  directoryShowWhatsapp: boolean("directory_show_whatsapp").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Inbound leads from the (future) public STUDIODO landing page's signup form —
// deliberately a SEPARATE table from `tenants`, not a tenant with status
// 'pending': an application isn't a tenant yet (no admin login, no kiosk key,
// nothing for a kiosk to authenticate with), it's just a form submission a
// superadmin reviews and either converts into a real tenant (via the existing
// tenant-creation path, which also marks this row `converted`) or rejects.
// The landing page itself doesn't exist yet, but the intake endpoint it will
// POST to does — see POST /api/tenant-applications.
export const tenantApplications = pgTable("tenant_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessName: text("business_name").notNull(),
  ownerName: text("owner_name").notNull(),
  ownerEmail: text("owner_email").notNull(),
  ownerWhatsapp: text("owner_whatsapp"),
  businessType: text("business_type"),
  city: text("city"),
  address: text("address"),
  website: text("website"),
  instagramHandle: text("instagram_handle"),
  referralSource: text("referral_source"),
  message: text("message"), // free-text "tell us about your business" field
  status: text("status").notNull().default("pending"), // 'pending' | 'converted' | 'rejected'
  convertedTenantId: uuid("converted_tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  reviewedBy: text("reviewed_by"), // superadmin email
  reviewedAt: timestamp("reviewed_at"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("tenant_applications_status_idx").on(table.status)]);

// Subscription tiers a superadmin defines platform-wide (not per-tenant) — the
// "menu" tenants.plan is chosen from. Kept as a separate table (rather than a
// hardcoded enum) so pricing/limits can change without a deploy. tenants.plan
// stores the plan's `slug` as plain text rather than a FK, on purpose: it lets
// legacy tenants keep an arbitrary label even if the plan that created it is
// later renamed or deleted, and avoids a migration for tenants created before
// this table existed.
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  billingInterval: text("billing_interval").notNull().default("monthly"), // 'monthly' | 'yearly'
  kioskLimit: integer("kiosk_limit"), // null = unlimited
  // Feature gates — default true so upgrading the DB never silently takes
  // something away from a tenant already using it; a superadmin dials plans
  // down deliberately from here on. See server/lib/planFeatures.ts for how
  // these are read and enforced.
  screenBuilderEnabled: boolean("screen_builder_enabled").notNull().default(true),
  gifVideoEnabled: boolean("gif_video_enabled").notNull().default(true),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Billing history — one row per payment a superadmin records against a tenant's
// subscription (manual for now, no payment gateway in front of this yet). This
// is what turns "extend subscription" from a bare date edit into an auditable
// transaction: who recorded it, how much, for what plan/period.
export const tenantPayments = pgTable("tenant_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  planName: text("plan_name"), // snapshot — survives the plan being renamed/deleted later
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  method: text("method").notNull().default("manual"), // 'manual' | 'transfer' | 'cash' | 'other'
  periodDays: integer("period_days").notNull(),
  note: text("note"),
  recordedBy: text("recorded_by"), // superadmin email — light audit trail
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("tenant_payments_tenant_id_idx").on(table.tenantId)]);

// Tenant admins (dashboard login). Replaces the old single install-wide password.
export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("admins_tenant_id_idx").on(table.tenantId)]);

// Platform-level operators ("admin pusat") — a completely separate identity from
// tenant `admins`. Can see/edit every tenant (plan, status, subscription, global
// renewal settings), so this is deliberately its own table + its own JWT type
// rather than a flag on `admins`, to keep a tenant-admin bug from ever leaking
// cross-tenant access.
export const superadmins = pgTable("superadmins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Singleton row (platform-wide, not per-tenant) of settings a superadmin can tune
// from the Superadmin dashboard: default trial length for new tenants, and where
// the tenant-facing "Perpanjang" (renew) button should point.
export const platformSettings = pgTable("platform_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  defaultTrialDays: integer("default_trial_days").notNull().default(7),
  // How long a NEW tenant's trial runs before subscriptionEndsAt is even reached —
  // distinct from gracePeriodDays below, which is what happens AFTER it's reached.
  renewalWhatsapp: text("renewal_whatsapp"),
  renewalCheckoutUrl: text("renewal_checkout_url"),
  // Fase 6 — days of tolerance AFTER tenants.subscriptionEndsAt has passed before
  // the kiosk actually locks (see server/lib/subscription.ts). Platform-wide, not
  // per-tenant, same as defaultTrialDays above.
  gracePeriodDays: integer("grace_period_days").notNull().default(3),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Append-only platform activity/error log — didn't exist before. tenantId
// null means a platform-wide event (e.g. a plan created/deleted, or an
// unhandled server error with no tenant context yet). Deliberately one table
// for both "activity" (info) and "error" (warning/error) rather than two,
// since a superadmin wants one combined, filterable timeline, not two
// screens to cross-reference by timestamp. `action` is a short machine key
// (e.g. "tenant.created", "kiosk_key.revoked", "server.unhandled_error") for
// filtering; `message` is the human-readable line shown in the log viewer.
export const platformEvents = pgTable("platform_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  level: text("level").notNull().default("info"), // 'info' | 'warning' | 'error'
  category: text("category").notNull(), // 'tenant' | 'billing' | 'kiosk' | 'auth' | 'system'
  action: text("action").notNull(),
  message: text("message").notNull(),
  actorType: text("actor_type"), // 'superadmin' | 'tenant_admin' | 'kiosk' | 'system'
  actorLabel: text("actor_label"), // email or other human-readable identifier, snapshot at write time
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("platform_events_tenant_id_idx").on(table.tenantId),
  index("platform_events_created_at_idx").on(table.createdAt),
]);

// Kiosk pairing keys — how a physical kiosk identifies its tenant to the cloud API.
export const kioskKeys = pgTable("kiosk_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  label: text("label"),
  keyHash: text("key_hash").notNull().unique(),
  // Auth (kioskAuth.ts) only ever compares keyHash — this column exists purely
  // so a tenant admin can look the raw value back up (Admin → Kiosk → "Lihat
  // key") after losing it, instead of having to revoke and re-pair every kiosk
  // whenever they misplace a key. One kiosk key = one physical device, so
  // losing it without a way to recover it means a real on-site re-pairing trip.
  rawKey: text("raw_key").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  // Reported by the kiosk's own heartbeat (POST /api/kiosk/heartbeat), not
  // trusted for anything security-sensitive — just fleet visibility in the
  // admin dashboard (Fase 1b of the Operator Console roadmap).
  appVersion: text("app_version"),
  lastDiagnostics: jsonb("last_diagnostics").$type<{
    cameraOk: boolean;
    printerOk: boolean;
    networkOk: boolean;
    checkedAt: string;
  }>(),
  // Device lock: 1 kiosk key = 1 physical device/computer, even though a tenant
  // can hold many kiosk keys (many booths). Set on whichever device first
  // authenticates with this key (see server/middleware/kioskAuth.ts); every
  // later request must carry the same x-device-id or gets rejected. Null means
  // "not yet claimed" — either a brand-new key, or one an admin explicitly reset
  // after replacing that booth's hardware.
  boundDeviceId: text("bound_device_id"),
  boundAt: timestamp("bound_at"),
  // Per-kiosk override — most tenants want every booth to self-update, but a
  // specific machine (e.g. one mid-testing, or one an admin wants to hold
  // back deliberately) can opt out. Read by the kiosk's own heartbeat
  // response and enforced client-side in electron/main.cjs, not by the
  // server refusing anything — this is advisory, not a security boundary.
  autoUpdateEnabled: boolean("auto_update_enabled").notNull().default(true),
}, (table) => [index("kiosk_keys_tenant_id_idx").on(table.tenantId)]);

// Paket foto (packages)
export const packages = pgTable("packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  photoCount: integer("photo_count").notNull(),
  hasGif: boolean("has_gif").notNull().default(false),
  hasVideo: boolean("has_video").notNull().default(false),
  extraPrints: jsonb("extra_prints").$type<{ id: string; name: string; price: number }[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  thumbnailUrl: text("thumbnail_url"),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("packages_tenant_id_idx").on(table.tenantId)]);

// Voucher codes (including FREE) — code is unique per tenant, not globally.
export const vouchers = pgTable("vouchers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  discountType: text("discount_type").notNull().default("percent"), // 'percent' | 'fixed' | 'free'
  discountValue: numeric("discount_value", { precision: 12, scale: 2 }).notNull().default("0"),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  active: boolean("active").notNull().default(true),
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
  voucherType: text("voucher_type").notNull().default("discount"), // 'discount' | 'cash'
  cashAmount: numeric("cash_amount", { precision: 12, scale: 2 }),
  invoiceNumber: text("invoice_number"),
  customerName: text("customer_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("vouchers_tenant_id_idx").on(table.tenantId),
  unique("vouchers_tenant_code_unique").on(table.tenantId, table.code),
]);

// One row per successful redemption — usedCount on the voucher itself is
// just an atomic counter, not a record of WHICH session redeemed it or WHEN,
// so a real usage report (per-session, per-date, revenue given away) needs
// this. Immutable snapshot at redemption time (not a live join against
// sessions.voucherCode, which is a plain string, not a FK, and can't tell
// two redemptions of the same reusable code apart).
export const voucherRedemptions = pgTable("voucher_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  voucherId: uuid("voucher_id").notNull().references(() => vouchers.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
  redemptionPurpose: text("redemption_purpose").notNull().default("session"), // 'session' | 'additional_print'
  originalAmount: numeric("original_amount", { precision: 12, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull(),
  finalAmount: numeric("final_amount", { precision: 12, scale: 2 }).notNull(),
  redeemedAt: timestamp("redeemed_at").notNull().defaultNow(),
}, (table) => [
  index("voucher_redemptions_tenant_id_idx").on(table.tenantId),
  index("voucher_redemptions_voucher_id_idx").on(table.voucherId),
]);

// Photo/kiosk sessions
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  packageId: uuid("package_id").references(() => packages.id),
  orientation: text("orientation").notNull().default("portrait"), // 'portrait' | 'landscape'
  paymentMethod: text("payment_method").notNull().default("qris"), // 'qris' | 'voucher'
  paymentStatus: text("payment_status").notNull().default("pending"), // pending | success | expired | failed
  selectedExtras: jsonb("selected_extras").$type<{ id: string; name: string; price: number }[]>().notNull().default([]),
  additionalPrintsPaid: integer("additional_prints_paid").notNull().default(0),
  additionalPrintsPending: integer("additional_prints_pending").notNull().default(0),
  paymentPurpose: text("payment_purpose").notNull().default("session"), // 'session' | 'additional_print'
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),
  voucherCode: text("voucher_code"),
  xenditInvoiceId: text("xendit_invoice_id"),
  filter: text("filter").notNull().default("normal"),
  frameId: uuid("frame_id"),
  layout: text("layout"),
  visualTemplate: text("visual_template"),
  photoUrls: jsonb("photo_urls").$type<string[]>().default([]),
  // gifUrl/videoUrl hold the COMBINED "living template" output — the whole
  // frame with every slot animating at once. slotClipUrls holds the short
  // clip captured at each individual photo shot, indexed the same as
  // photoUrls, so each one can also be offered as its own small download.
  gifUrl: text("gif_url"),
  videoUrl: text("video_url"),
  slotClipUrls: jsonb("slot_clip_urls").$type<(string | null)[]>().default([]),
  mediaUrls: jsonb("media_urls").$type<string[]>().notNull().default([]),
  stripUrl: text("strip_url"),
  driveFolderId: text("drive_folder_id"),
  drivePhotoIds: jsonb("drive_photo_ids").$type<{ fileId: string; viewUrl: string; downloadUrl: string; previewUrl: string }[]>().default([]),
  driveStripId: text("drive_strip_id"),
  shareUrl: text("share_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  customerWhatsapp: text("customer_whatsapp"),
  customerEmail: text("customer_email"),
  publishConsent: boolean("publish_consent").notNull().default(false),
  feedback: text("feedback"),
}, (table) => [index("sessions_tenant_id_created_at_idx").on(table.tenantId, table.createdAt)]);

// Admin-uploaded custom templates (frame PNG + slot positions)
export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  frameImageUrl: text("frame_image_url").notNull(),
  slots: jsonb("slots").$type<{ x: number; y: number; w: number; h: number; rotation?: number }[]>().notNull(),
  canvasWidth: integer("canvas_width").notNull(),
  canvasHeight: integer("canvas_height").notNull(),
  orientation: text("orientation").notNull().default("portrait"),
  category: text("category").notNull().default("custom"),
  style: text("style").notNull().default("Custom"),
  outputPreset: text("output_preset").notNull().default("4r"),
  active: boolean("active").notNull().default(true),
  // Set when the tenant installed this template from the marketplace catalog (null = they made it
  // themselves). Lets "install" be idempotent; the catalog entry can be removed without touching
  // installed copies (ON DELETE SET NULL).
  marketplaceTemplateId: uuid("marketplace_template_id").references(() => marketplaceTemplates.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("templates_tenant_id_idx").on(table.tenantId)]);

// Simple overlay frames (no custom slots)
export const frameOverlays = pgTable("frame_overlays", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  imageUrl: text("image_url").notNull(),
  orientation: text("orientation").notNull().default("portrait"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("frame_overlays_tenant_id_idx").on(table.tenantId)]);

// Per-tenant branding/theme/integration settings (one row per tenant).
export const tenantSettings = pgTable("tenant_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  brandName: text("brand_name").notNull().default("STUDIODO"),
  tagline: text("tagline"),
  logoUrl: text("logo_url"),
  contactWhatsapp: text("contact_whatsapp"),
  socialInstagram: text("social_instagram"),
  socialTiktok: text("social_tiktok"),
  socialFacebook: text("social_facebook"),
  websiteUrl: text("website_url"),
  address: text("address"),
  accentColor: text("accent_color").notNull().default("#7C3AED"),
  fontFamily: text("font_family").notNull().default("Inter"),
  promoText: text("promo_text"),
  captureVibe: text("capture_vibe").notNull().default("Electric"),
  countdownSeconds: integer("countdown_seconds").notNull().default(3),
  beepEnabled: boolean("beep_enabled").notNull().default(true),
  sessionTimerMinutes: integer("session_timer_minutes").notNull().default(5),
  cameraMode: text("camera_mode").notNull().default("webcam"), // 'webcam' | 'tether'
  tetherBridgeUrl: text("tether_bridge_url"),
  qrisEnabled: boolean("qris_enabled").notNull().default(true),
  cashPaymentEnabled: boolean("cash_payment_enabled").notNull().default(false),
  xenditSecretKey: text("xendit_secret_key"),
  xenditWebhookToken: text("xendit_webhook_token"),
  storageDriver: text("storage_driver"), // 'local' | 'r2' | 'gdrive'; falls back to env/local when unset
  r2AccountId: text("r2_account_id"),
  r2Endpoint: text("r2_endpoint"),
  r2Bucket: text("r2_bucket"),
  r2AccessKeyId: text("r2_access_key_id"),
  r2SecretAccessKey: text("r2_secret_access_key"),
  r2PublicBaseUrl: text("r2_public_base_url"),
  r2Prefix: text("r2_prefix"),
  gdriveServiceAccountJson: text("gdrive_service_account_json"),
  gdriveFolderId: text("gdrive_folder_id"),
  additionalPrintEnabled: boolean("additional_print_enabled").notNull().default(true),
  additionalPrintLabel: text("additional_print_label").notNull().default("Tambah print 4R"),
  additionalPrintPrice: numeric("additional_print_price", { precision: 12, scale: 2 }).notNull().default("15000"),
  additionalPrintMax: integer("additional_print_max").notNull().default(5),
  stripLayout: text("strip_layout").notNull().default("classic-vertical"),
  stripTemplate: text("strip_template").notNull().default("solid"),
  // Kiosk flow builder (Fase 4) — which optional steps are on, and in what order.
  // `order` always contains all 8 KioskStepKey values; `enabled` covers only the
  // non-locked ones (packages/payment/capture/result are always on). Validated
  // server-side against server/lib/kioskFlowRules.ts before ever being saved —
  // this column is never trusted as pre-validated just because it's present.
  kioskFlow: jsonb("kiosk_flow").$type<{ order: string[]; enabled: Record<string, boolean> }>(),
  // Frame categories (Kelola Frame → "+ Kategori baru…") — was client-only
  // localStorage (frameCategoryStore.ts), so a category made on the admin's
  // browser never existed on a separate kiosk device; frames tagged with it
  // silently fell back to "Custom" there. Same tenant-wide-jsonb-column +
  // GET/POST sync shape as kioskFlow above. Null/empty means "no custom
  // categories saved yet" — both readers fall back to the same six built-in
  // defaults (server/routes/frames.ts, client/lib/frameCategoryStore.ts).
  frameCategories: jsonb("frame_categories").$type<{ key: string; label: string }[]>(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// WYSIWYG screen builder (Fase 5a) — a position/size override per (tenant, kiosk
// screen, orientation). Absent = that element renders at its normal in-flow
// position; a row here only ever repositions elements that already exist on the
// page (see client/src/components/Positionable.tsx) — it is not a source of new
// content, just layout. One row per screen+orientation combination a tenant has
// actually customized (most will have zero rows until someone opens the builder).
export const screenLayouts = pgTable("screen_layouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  screenKey: text("screen_key").notNull(), // KioskStepKey | "idle"
  orientation: text("orientation").notNull(), // 'portrait' | 'landscape'
  elements: jsonb("elements").$type<{
    id: string;
    type: "system-button" | "text" | "system-steplist" | "image";
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
    zIndex: number;
    fontSizeVw?: number;
  }[]>().notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("screen_layouts_tenant_id_idx").on(table.tenantId),
  unique("screen_layouts_tenant_screen_orientation_unique").on(table.tenantId, table.screenKey, table.orientation),
]);

// Editable marketing-website content (studiodo-web landing page), one row per
// section/module. A missing row means "use the built-in defaults" (see
// server/lib/siteContent.ts), so a fresh database renders the full landing page
// with zero setup and a superadmin only stores what they actually changed.
// `data` is validated against the section's field schema on every write — it is
// never trusted as arbitrary JSON, because the public site renders it.
export const siteContent = pgTable("site_content", {
  key: text("key").primaryKey(), // 'hero' | 'features' | … | 'site' (see SECTION_DEFS)
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order"), // null = default position
  updatedBy: text("updated_by"), // superadmin email
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Online subscription payments (Midtrans Snap) — one row per checkout attempt. The
// webhook flips `status` pending → paid exactly once (guarded by an UPDATE … WHERE
// status = 'pending'), and only then extends the tenant's subscription and records
// the tenant_payments row, so a retried/duplicated notification never double-extends.
export const billingOrders = pgTable("billing_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: text("order_id").notNull().unique(), // sent to Midtrans as order_id
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  planName: text("plan_name").notNull(), // snapshot
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(), // snapshot — what was actually charged
  periodDays: integer("period_days").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'paid' | 'failed' | 'expired'
  snapToken: text("snap_token"),
  redirectUrl: text("redirect_url"),
  paymentType: text("payment_type"), // as reported by Midtrans, e.g. 'qris' | 'bank_transfer'
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("billing_orders_tenant_id_idx").on(table.tenantId)]);

// Blog articles for the marketing website, written from the Superadmin dashboard.
// `body` is Markdown; the website renders it with its own restricted renderer (no raw
// HTML), so what is stored here is never treated as trusted markup.
export const blogPosts = pgTable("blog_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  body: text("body").notNull().default(""),
  author: text("author"),
  category: text("category").notNull().default("Informasi"), // one of BLOG_CATEGORIES (routes/blog.ts)
  coverUrl: text("cover_url"), // "/api/public/assets/<id>" or null
  position: integer("position"), // optional manual order (used for step-by-step guides); null = by date
  status: text("status").notNull().default("draft"), // 'draft' | 'published'
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("blog_posts_status_published_idx").on(table.status, table.publishedAt)]);

// Marketplace catalog — frames a superadmin has curated for every tenant to browse and install.
// Deliberately a snapshot copy (image URL + slot layout) rather than a live pointer at a tenant's
// template: the source tenant editing or deleting theirs must never change or break what other
// tenants already installed. Installing copies a row into `templates` for that tenant.
export const marketplaceTemplates = pgTable("marketplace_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  creatorName: text("creator_name"), // credit shown on the card; null = STUDIODO
  category: text("category").notNull().default("custom"), // frame category key: minimal | wedding | birthday | corporate | seasonal | custom
  frameImageUrl: text("frame_image_url").notNull(), // absolute URL
  slots: jsonb("slots").$type<{ x: number; y: number; w: number; h: number; rotation?: number }[]>().notNull(),
  canvasWidth: integer("canvas_width").notNull(),
  canvasHeight: integer("canvas_height").notNull(),
  orientation: text("orientation").notNull().default("portrait"),
  outputPreset: text("output_preset").notNull().default("4r"),
  featured: boolean("featured").notNull().default(false),
  active: boolean("active").notNull().default(true), // false = hidden from the catalog (still installed where already used)
  installCount: integer("install_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("marketplace_templates_active_idx").on(table.active, table.featured)]);

// Inbound applications from template designers who want to contribute to the marketplace
// (website /kreator form). A superadmin reviews them and, if accepted, builds/publishes the
// template through the normal marketplace flow — there is no file upload here by design:
// a portfolio link is enough to judge whether to talk to someone.
export const creatorSubmissions = pgTable("creator_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  whatsapp: text("whatsapp"),
  portfolioUrl: text("portfolio_url").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("new"), // 'new' | 'reviewing' | 'accepted' | 'rejected'
  note: text("note"), // superadmin-only
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("creator_submissions_status_idx").on(table.status, table.createdAt)]);

// Images uploaded from the Superadmin CMS for the marketing website (client logos, site logo).
// Stored in the database rather than the per-tenant file storage: these are tiny, platform-owned,
// and must not depend on any tenant's storage settings. Served by GET /api/public/assets/:id.
export const siteAssets = pgTable("site_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(), // only image/png | image/jpeg | image/webp (verified from the bytes)
  data: bytea("data").notNull(),
  size: integer("size").notNull(),
  uploadedBy: text("uploaded_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
