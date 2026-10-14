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
  uniqueIndex,
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
  // Optional email categories the tenant switched OFF (lib/emailPrefs.ts). Missing key = on. Security mail is never optional.
  emailPrefs: jsonb("email_prefs").$type<Record<string, boolean>>().notNull().default({}),
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
  // Where kiosk QRIS money lands. 'direct' = the tenant's own Xendit account (keys in tenant_settings, the original
  // model — nothing to withdraw). 'platform' = STUDIODO's Xendit account collects it and the tenant withdraws the
  // balance (see `withdrawals`). `qrisPlatformSince` marks when that began: only QRIS payments after it count.
  qrisSettlement: text("qris_settlement").notNull().default("direct"), // 'direct' | 'platform'
  qrisPlatformSince: timestamp("qris_platform_since"),
  // Negotiated discount (0-90 %) a superadmin grants this tenant on every booth subscription it buys, on top of the
  // platform-wide volume tiers (platform_settings.volume_discounts). The better of the two applies — they do not stack.
  boothDiscountPercent: integer("booth_discount_percent").notNull().default(0),
  boothDiscountNote: text("booth_discount_note"), // superadmin-only reason, e.g. "Paket 12 booth event organizer"
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
  // Set when the applicant clicks the verification link in the confirmation email (lib/emailTokens.ts). Null = unverified.
  emailVerifiedAt: timestamp("email_verified_at"),
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
  // Marketing / pricing presentation (see server/lib/planPricing.ts for how these turn into the prices shown and charged).
  discountPercent: integer("discount_percent").notNull().default(0), // 0-90, off the list price
  discountLabel: text("discount_label"), // e.g. "Promo peluncuran"
  discountEndsAt: timestamp("discount_ends_at"), // null = no end date
  yearlyDiscountPercent: integer("yearly_discount_percent").notNull().default(0), // extra off 12x the monthly price; 0 = no yearly option
  featured: boolean("featured").notNull().default(false), // "Paling populer" highlight on the website
  features: jsonb("features").$type<string[]>().notNull().default([]), // extra bullet lines shown on the pricing card
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
  // Two-factor sign-in (TOTP, see lib/totp.ts + routes/superadminTwoFactor.ts). The secret is encrypted at rest; it only counts
  // once totp_enabled_at is set (after the owner proved the authenticator app works). Recovery codes are stored as hashes.
  totpSecretEnc: text("totp_secret_enc"),
  totpEnabledAt: timestamp("totp_enabled_at"),
  totpLastStep: integer("totp_last_step"), // last accepted 30-second step: a code can never be used twice
  recoveryCodes: jsonb("recovery_codes").$type<string[]>().notNull().default([]),
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
  // QRIS withdrawals (platform-settled tenants only): the % STUDIODO keeps from each QRIS payment, the smallest
  // amount a tenant may withdraw, and a flat fee deducted from every payout.
  qrisFeePercent: numeric("qris_fee_percent", { precision: 5, scale: 2 }).notNull().default("0.70"),
  withdrawalMinAmount: integer("withdrawal_min_amount").notNull().default(50000),
  withdrawalFlatFee: integer("withdrawal_flat_fee").notNull().default(0),
  // Volume discount on booth subscriptions: buying `minBooths` or more booths in one order takes `percent` off each of
  // them. Managed by the superadmin; the default is the "10+ booths" offer advertised on the website.
  volumeDiscounts: jsonb("volume_discounts").$type<{ minBooths: number; percent: number }[]>().notNull().default([{ minBooths: 10, percent: 10 }]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// A tenant's request to pay out their QRIS balance to a bank account / e-wallet. The tenant asks (pending); a
// superadmin transfers the money by hand and follows it up (processing → paid, or rejected with a reason). The
// balance is derived, never stored: qris income − platform fee − every withdrawal that is not rejected.
export const withdrawals = pgTable("withdrawals", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(), // taken from the balance
  feeAmount: numeric("fee_amount", { precision: 12, scale: 2 }).notNull().default("0"), // flat payout fee (snapshot)
  netAmount: numeric("net_amount", { precision: 12, scale: 2 }).notNull(), // what the tenant actually receives
  status: text("status").notNull().default("pending"), // 'pending' | 'processing' | 'paid' | 'rejected'
  bankName: text("bank_name").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  requestNote: text("request_note"),
  adminNote: text("admin_note"), // reason when rejected / remark when paid — visible to the tenant
  transferReference: text("transfer_reference"), // bank transfer reference entered by the superadmin
  requestedBy: text("requested_by"),
  processedBy: text("processed_by"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
}, (table) => [index("withdrawals_tenant_id_idx").on(table.tenantId), index("withdrawals_status_idx").on(table.status)]);

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
  // Per-booth subscription: ONE key = ONE booth = ONE licence. A tenant that runs five booths pays for five keys, each
  // with its own end date, so an expired or unpaid booth locks without touching the others.
  //   'trial'  — free trial issued by a superadmin; locks the moment `licenseEndsAt` passes (no grace period)
  //   'paid'   — a paying booth; locks `gracePeriodDays` after `licenseEndsAt`. A null end date = unlimited (complimentary)
  //   'unpaid' — key created but never subscribed to; the kiosk can pair but stays locked until it is paid for
  licenseType: text("license_type").notNull().default("unpaid"),
  licenseEndsAt: timestamp("license_ends_at"),
  licensePlanSlug: text("license_plan_slug"), // plan the booth was last bought on (display only)
  // Set when the key was issued as a trial. Survives a later trial→paid conversion, so a computer that already used a
  // trial can't be paired with a second trial key (see requireKioskAuth).
  trialStartedAt: timestamp("trial_started_at"),
  // Activation: a key becomes usable only after a tenant admin LOGGED IN on the computer and entered it (POST
  // /api/kiosk-keys/activate) — that is what binds the device. A key that was merely copied can no longer claim a device
  // by itself. Keys already bound before activation existed were grandfathered (activated_at = bound_at).
  activatedAt: timestamp("activated_at"),
  // SHA-256 of the per-device secret issued at activation (kept in the Electron main process, never in the web page's
  // storage). Once set, every kiosk request must also carry it: knowing the key AND the (guessable) device id is not enough.
  deviceTokenHash: text("device_token_hash"),
  // Tenant self-service "Reset device" is capped (see lib/deviceLock.ts) so one paid key can't be rotated across many PCs.
  deviceResetCount: integer("device_reset_count").notNull().default(0),
  deviceResetWindowStart: timestamp("device_reset_window_start"),
}, (table) => [index("kiosk_keys_tenant_id_idx").on(table.tenantId)]);

// A permanent memory of which computers already used a free trial. Unlike kiosk_keys.bound_device_id it is NOT cleared by
// "reset device", revoking a key or deleting a tenant, so trial-hopping (new account, new key, same PC) stays blocked.
// A superadmin can free a computer from here when a trial was legitimately granted twice.
export const deviceRegistry = pgTable("device_registry", {
  deviceId: text("device_id").primaryKey(),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  trialStartedAt: timestamp("trial_started_at"),
  trialKeyId: uuid("trial_key_id"),
  trialTenantId: uuid("trial_tenant_id"),
  note: text("note"),
});

// Paket foto (packages)
export const packages = pgTable("packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  photoCount: integer("photo_count").notNull(),
  hasGif: boolean("has_gif").notNull().default(false),
  hasVideo: boolean("has_video").notNull().default(false),
  // A slow stop-motion video built from every photo of the session (separate from the live GIF/video clips above).
  hasStopMotion: boolean("has_stop_motion").notNull().default(false),
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
  // Custom-frame voucher: redeeming it puts the session straight into this (customer-specific) template.
  frameId: uuid("frame_id"),
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
  // Which booth (kiosk key) ran this session — what lets the live monitor say "booth X is mid-session". Null on sessions
  // from before this column existed, and when the booth's key is later deleted.
  kioskKeyId: uuid("kiosk_key_id").references(() => kioskKeys.id, { onDelete: "set null" }),
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
  stopMotionUrl: text("stop_motion_url"),
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
}, (table) => [
  index("sessions_tenant_id_created_at_idx").on(table.tenantId, table.createdAt),
  index("sessions_kiosk_key_id_idx").on(table.kioskKeyId, table.createdAt),
]);

// CRM: a customer is not a row of its own — they are derived from the contact details on their sessions (grouped by
// WhatsApp number, else email). This table only holds what the tenant adds ON TOP of that: a name, notes, tags, and a
// "do not message" flag. `contactKey` is "wa:<62…>" or "em:<email>" (see lib/crm.ts).
export const customerProfiles = pgTable("customer_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  contactKey: text("contact_key").notNull(),
  name: text("name"),
  notes: text("notes"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  marketingOptOut: boolean("marketing_opt_out").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [unique("customer_profiles_tenant_key_unique").on(table.tenantId, table.contactKey)]);

// In-app notifications for the tenant dashboard. `tenantId` null = broadcast to every tenant. Read state is per tenant
// (notification_reads) so one broadcast row serves everybody. `kind` lets future producers plug in without a schema change:
// 'platform' (message from STUDIODO), 'customer_message', 'billing', 'booth', 'system'.
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("platform"),
  severity: text("severity").notNull().default("info"), // 'info' | 'success' | 'warning' | 'critical'
  title: text("title").notNull(),
  body: text("body"),
  linkUrl: text("link_url"), // in-portal path (/portal/...) or https URL
  createdBy: text("created_by"), // superadmin email, or a producer label such as 'system'
  expiresAt: timestamp("expires_at"),
  // Set by automatic producers (lib/notificationRules.ts) so the same alert is never raised twice. Null for hand-written ones.
  dedupeKey: text("dedupe_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("notifications_tenant_created_idx").on(table.tenantId, table.createdAt),
  uniqueIndex("notifications_dedupe_idx").on(table.tenantId, table.dedupeKey),
]);

export const notificationReads = pgTable("notification_reads", {
  notificationId: uuid("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at").notNull().defaultNow(),
}, (table) => [unique("notification_reads_pk").on(table.notificationId, table.tenantId)]);

// Tenant feedback on marketplace templates. A review needs an installed copy (checked in the API); one per tenant per
// template, editable. Reports flag a template for the Superadmin (broken file, copyright, inappropriate…).
export const marketplaceReviews = pgTable("marketplace_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketplaceTemplateId: uuid("marketplace_template_id").notNull().references(() => marketplaceTemplates.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(), // 1..5
  comment: text("comment").notNull().default(""),
  status: text("status").notNull().default("published"), // 'published' | 'hidden' (moderated)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("marketplace_reviews_unique").on(table.marketplaceTemplateId, table.tenantId),
  index("marketplace_reviews_template_idx").on(table.marketplaceTemplateId, table.status),
]);

export const marketplaceReports = pgTable("marketplace_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  marketplaceTemplateId: uuid("marketplace_template_id").notNull().references(() => marketplaceTemplates.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(), // 'rusak' | 'hak_cipta' | 'tidak_pantas' | 'menyesatkan' | 'lainnya'
  detail: text("detail").notNull().default(""),
  status: text("status").notNull().default("open"), // 'open' | 'resolved' | 'dismissed'
  resolution: text("resolution"), // what the Superadmin did / said
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("marketplace_reports_status_idx").on(table.status, table.createdAt), index("marketplace_reports_template_idx").on(table.marketplaceTemplateId)]);

// One row per email attempt (sent / failed / skipped because no API key). Recipient + subject only, never the body, and
// pruned after 90 days. Shown in Superadmin → Email so a missing welcome mail can be traced and followed up.
export const emailLog = pgTable("email_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  kind: text("kind").notNull().default(""), // short label of why it was sent ("kuitansi pembayaran")
  status: text("status").notNull(), // 'sent' | 'failed' | 'skipped'
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("email_log_created_idx").on(table.createdAt), index("email_log_status_idx").on(table.status, table.createdAt)]);

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
  // Custom frames (category "__custom") are made for one customer and sold at the cashier: their price and who they are for.
  price: numeric("price", { precision: 12, scale: 2 }),
  customerName: text("customer_name"),
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
  socialYoutube: text("social_youtube"),
  hashtag: text("hashtag"),
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
  // Which gateway collects kiosk payments for this tenant: 'xendit' (default) or 'doku' (hosted checkout, QR → pay page).
  paymentProvider: text("payment_provider").notNull().default("xendit"),
  dokuClientId: text("doku_client_id"),
  dokuSecretKeyEnc: text("doku_secret_key_enc"), // encrypted with lib/secretBox
  dokuEnvironment: text("doku_environment").notNull().default("sandbox"), // 'sandbox' | 'production'
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
  // The kiosk customizer's design choices (colors, fonts, headlines, button style, idle cover, event settings …).
  // These used to live ONLY in the kiosk PC's localStorage, while every app start overwrote them with stale
  // server defaults — so a tenant's customization "reset itself" the next day. Now the dashboard saves them here
  // and every kiosk loads them at boot. Sanitized server-side (see routes/config.ts); null = never saved yet.
  kioskConfig: jsonb("kiosk_config").$type<Record<string, unknown>>(),
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
  // Shape is validated and documented in routes/screenLayouts.ts (LayoutElement).
  elements: jsonb("elements").$type<Record<string, unknown>[]>().notNull().default([]),
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
  provider: text("provider").notNull().default("midtrans"), // which gateway created this checkout
  providerRef: text("provider_ref"), // gateway-side id (Xendit invoice id)
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  planName: text("plan_name").notNull(), // snapshot
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(), // snapshot — what was actually charged
  periodDays: integer("period_days").notNull(),
  // Which booths this payment covers: existing keys to renew (`keyId`) and brand-new booths to create once paid
  // (`keyId` null). Empty on orders made before per-booth licences — those extend every active key of the tenant.
  items: jsonb("items").$type<{ keyId: string | null; label: string | null }[]>().notNull().default([]),
  boothCount: integer("booth_count").notNull().default(1),
  discountPercent: integer("discount_percent").notNull().default(0), // snapshot of the volume/negotiated discount applied
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
  emailVerifiedAt: timestamp("email_verified_at"),
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

// Platform-level payment gateways used to collect STUDIODO subscription fees from tenants (NOT the
// tenant's own Xendit account for kiosk sales — that lives in tenant_settings). One row per provider.
// Secrets are stored encrypted (lib/secretBox.ts) and are write-only through the API: they are never
// returned, only a masked tail. A provider with no stored key falls back to its environment variables.
export const paymentGateways = pgTable("payment_gateways", {
  provider: text("provider").primaryKey(), // 'midtrans' | 'xendit'
  enabled: boolean("enabled").notNull().default(false),
  priority: integer("priority").notNull().default(100), // lower = tried first at checkout
  environment: text("environment").notNull().default("sandbox"), // 'sandbox' | 'production' (Midtrans; Xendit keys are self-describing)
  secretKeyEnc: text("secret_key_enc"),
  secretKeyLast4: text("secret_key_last4"),
  webhookTokenEnc: text("webhook_token_enc"), // Xendit callback verification token
  lastTestAt: timestamp("last_test_at"),
  lastTestOk: boolean("last_test_ok"),
  lastTestMessage: text("last_test_message"),
  lastWebhookAt: timestamp("last_webhook_at"),
  lastWebhookResult: text("last_webhook_result"), // short human note, e.g. "paid SDO-…" or "signature ditolak"
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Template-designer accounts for the marketplace creator portal (web /kreator/portal). Accounts are
// created by a superadmin after accepting a creator_submissions application — never self-service —
// so the catalog stays curated. Separate identity realm from tenant admins and superadmins.
export const creators = pgTable("creators", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // credit shown on published templates
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  whatsapp: text("whatsapp"),
  emailPrefs: jsonb("email_prefs").$type<Record<string, boolean>>().notNull().default({}),
  // Public profile shown on /kreator/<id> and under each published template.
  bio: text("bio"),
  instagramHandle: text("instagram_handle"),
  website: text("website"),
  status: text("status").notNull().default("active"), // 'active' | 'suspended'
  submissionId: uuid("submission_id"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// A designer's work-in-progress / submitted template. Approving one copies it into
// marketplace_templates (the curated catalog) — the copy is what tenants install, so a creator
// editing or deleting their draft later never changes what's already live or installed.
export const creatorTemplates = pgTable("creator_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: uuid("creator_id").notNull().references(() => creators.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("custom"),
  orientation: text("orientation").notNull().default("portrait"),
  outputPreset: text("output_preset").notNull().default("4r"),
  canvasWidth: integer("canvas_width").notNull().default(0),
  canvasHeight: integer("canvas_height").notNull().default(0),
  slots: jsonb("slots").$type<{ x: number; y: number; w: number; h: number; rotation?: number }[]>().notNull().default([]),
  frameAssetId: uuid("frame_asset_id").references(() => siteAssets.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"), // 'draft' | 'pending' | 'approved' | 'rejected'
  reviewNote: text("review_note"), // shown to the creator on rejection
  marketplaceTemplateId: uuid("marketplace_template_id"), // set once approved
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("creator_templates_creator_idx").on(table.creatorId, table.updatedAt), index("creator_templates_status_idx").on(table.status)]);

// ---------------------------------------------------------------------------------------------------------------------
// POS / Kasir. A central cashier (web portal) that sells booth packages, extra prints and ordinary products in one cart,
// runs shifts with cash counting, hands out queue numbers and refunds with a supervisor PIN. Selling a package or print
// also mints a one-use "cash" voucher the customer types at the kiosk, so the existing payment flow marks that session paid.
// ---------------------------------------------------------------------------------------------------------------------
export type PosOrderItem = { type: "package" | "print" | "product" | "custom" | "frame"; refId?: string | null; name: string; qty: number; unitPrice: number };

export const posSettings = pgTable("pos_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  supervisorPinHash: text("supervisor_pin_hash"), // null = refunds need no PIN
  receiptHeader: text("receipt_header").notNull().default(""),
  receiptFooter: text("receipt_footer").notNull().default("Terima kasih!"),
  queuePrefix: text("queue_prefix").notNull().default("A"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Things sold at the counter that are not photo packages (drinks, merch, printed frames…).
export const posProducts = pgTable("pos_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("pos_products_tenant_idx").on(table.tenantId)]);

export const posShifts = pgTable("pos_shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  cashierName: text("cashier_name").notNull(),
  openingCash: numeric("opening_cash", { precision: 12, scale: 2 }).notNull().default("0"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  expectedCash: numeric("expected_cash", { precision: 12, scale: 2 }), // frozen at close
  countedCash: numeric("counted_cash", { precision: 12, scale: 2 }),
  note: text("note"),
}, (table) => [index("pos_shifts_tenant_idx").on(table.tenantId, table.openedAt)]);

export const posOrders = pgTable("pos_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  shiftId: uuid("shift_id").references(() => posShifts.id, { onDelete: "set null" }),
  orderNumber: text("order_number").notNull(), // e.g. KSR-20261014-001, unique per tenant
  items: jsonb("items").$type<PosOrderItem[]>().notNull().default([]),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"), // 'cash' | 'qris' | 'transfer' | 'other'
  cashReceived: numeric("cash_received", { precision: 12, scale: 2 }),
  changeGiven: numeric("change_given", { precision: 12, scale: 2 }),
  status: text("status").notNull().default("paid"), // 'paid' | 'partial_refund' | 'refunded'
  refundedAmount: numeric("refunded_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  customerName: text("customer_name"),
  customerWhatsapp: text("customer_whatsapp"),
  kioskVoucherCode: text("kiosk_voucher_code"), // the code the customer enters at the booth, when the cart has a package/print
  queueTicketId: uuid("queue_ticket_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("pos_orders_tenant_idx").on(table.tenantId, table.createdAt),
  index("pos_orders_shift_idx").on(table.shiftId),
  unique("pos_orders_tenant_number_unique").on(table.tenantId, table.orderNumber),
]);

export const posRefunds = pgTable("pos_refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => posOrders.id, { onDelete: "cascade" }),
  shiftId: uuid("shift_id").references(() => posShifts.id, { onDelete: "set null" }), // the shift the money left the drawer in
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  items: jsonb("items").$type<{ index: number; qty: number }[]>().notNull().default([]),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("pos_refunds_order_idx").on(table.orderId), index("pos_refunds_tenant_idx").on(table.tenantId, table.createdAt)]);

export const posQueueTickets = pgTable("pos_queue_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  queueDate: text("queue_date").notNull(), // YYYY-MM-DD in WIB: numbering restarts every day
  seq: integer("seq").notNull(),
  label: text("label").notNull(), // "A-007"
  customerName: text("customer_name"),
  customerWhatsapp: text("customer_whatsapp"),
  partySize: integer("party_size").notNull().default(1),
  status: text("status").notNull().default("waiting"), // 'waiting' | 'called' | 'serving' | 'done' | 'skipped'
  kioskKeyId: uuid("kiosk_key_id").references(() => kioskKeys.id, { onDelete: "set null" }), // booth they were sent to
  orderId: uuid("order_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  calledAt: timestamp("called_at"),
  doneAt: timestamp("done_at"),
}, (table) => [
  index("pos_queue_tenant_day_idx").on(table.tenantId, table.queueDate),
  unique("pos_queue_tenant_day_seq_unique").on(table.tenantId, table.queueDate, table.seq),
]);
