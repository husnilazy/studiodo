import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  numeric,
} from "drizzle-orm/pg-core";

// Paket foto (packages)
export const packages = pgTable("packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  photoCount: integer("photo_count").notNull(),
  hasGif: boolean("has_gif").notNull().default(false),
  hasVideo: boolean("has_video").notNull().default(false),
  extraPrints: jsonb("extra_prints").$type<{ id: string; name: string; price: number }[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Voucher codes (including FREE)
export const vouchers = pgTable("vouchers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
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
});

// Photo/kiosk sessions
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
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
  gifUrl: text("gif_url"),
  videoUrl: text("video_url"),
  mediaUrls: jsonb("media_urls").$type<string[]>().notNull().default([]),
  stripUrl: text("strip_url"),
  shareUrl: text("share_url"),
  boothId: text("booth_id").notNull().default("default"), // for multi-tenant/SaaS
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  customerWhatsapp: text("customer_whatsapp"),
  customerEmail: text("customer_email"),
  publishConsent: boolean("publish_consent").notNull().default(false),
  feedback: text("feedback"),
});

// Admin-uploaded custom templates (frame PNG + slot positions)
export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  frameImageUrl: text("frame_image_url").notNull(),
  slots: jsonb("slots").$type<{ x: number; y: number; w: number; h: number; rotation?: number }[]>().notNull(),
  canvasWidth: integer("canvas_width").notNull(),
  canvasHeight: integer("canvas_height").notNull(),
  orientation: text("orientation").notNull().default("portrait"),
  active: boolean("active").notNull().default(true),
  boothId: text("booth_id").notNull().default("default"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Simple overlay frames (no custom slots)
export const frameOverlays = pgTable("frame_overlays", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  imageUrl: text("image_url").notNull(),
  orientation: text("orientation").notNull().default("portrait"),
  active: boolean("active").notNull().default(true),
  boothId: text("booth_id").notNull().default("default"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Per-booth branding/theme config (mirrors localStorage admin store, synced for multi-device/SaaS)
export const boothConfig = pgTable("booth_config", {
  boothId: text("booth_id").primaryKey(),
  brandName: text("brand_name").notNull().default("STUDIODO"),
  tagline: text("tagline"),
  logoUrl: text("logo_url"),
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
  additionalPrintEnabled: boolean("additional_print_enabled").notNull().default(true),
  additionalPrintLabel: text("additional_print_label").notNull().default("Tambah print 4R"),
  additionalPrintPrice: numeric("additional_print_price", { precision: 12, scale: 2 }).notNull().default("15000"),
  additionalPrintMax: integer("additional_print_max").notNull().default(5),
  stripLayout: text("strip_layout").notNull().default("classic-vertical"),
  stripTemplate: text("strip_template").notNull().default("solid"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
