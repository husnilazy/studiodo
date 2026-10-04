import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { screenLayouts } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { requireAnyAuth } from "../middleware/anyAuth.js";
import { KIOSK_STEP_KEYS } from "../lib/kioskFlowRules.js";
import { getTenantPlanFeatures } from "../lib/planFeatures.js";
import { saveUploadedFile } from "../storage.js";
import { resolveFrameUrl } from "../lib/frameUrl.js";

export const screenLayoutsRouter = Router();

const VALID_SCREEN_KEYS = new Set<string>([...KIOSK_STEP_KEYS, "idle"]);
const VALID_ORIENTATIONS = new Set(["portrait", "landscape"]);

type ElementType = "system-button" | "text" | "system-steplist" | "image" | "marquee" | "video";
const VALID_ELEMENT_TYPES = new Set<ElementType>(["system-button", "text", "system-steplist", "image", "marquee", "video"]);

type LayoutElement = {
  id: string;
  type: ElementType;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  zIndex: number;
  fontSizeVw?: number;
  /** Text of a custom text / running-text element. */
  content?: string;
  /** Image / video / running-logo file. Uploaded as a data URL, stored as a file and kept here as a URL. */
  src?: string;
  /** Size multiplier of an element the page itself draws (title, buttons …) — these are moved and scaled, never stretched. */
  scale?: number;
  rotation?: number;
  opacity?: number;
  hidden?: boolean;
  color?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  fit?: "contain" | "cover";
  radius?: number;
  /** Running logo: seconds for one full pass, and which way it travels. */
  speed?: number;
  reverse?: boolean;
};

// Uploaded pictures/videos are written to file storage (not kept as base64 inside this row). The cap is on the upload.
const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 500;
const STORED_URL = /^(https?:\/\/|\/storage\/)/;

async function storeAsset(tenantId: string, value: string, id: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const match = /^data:([^;]+);base64,(.+)$/.exec(value);
  if (!match) return { ok: true, url: value }; // already a stored URL
  const [, mimetype, base64] = match;
  if (!/^(image|video)\//.test(mimetype)) return { ok: false, error: `Berkas elemen "${id}" harus gambar atau video` };
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_ASSET_BYTES) return { ok: false, error: `Berkas elemen "${id}" terlalu besar (maks 10MB).` };
  const subtype = (mimetype.split("/")[1] ?? "bin").replace(/\+.*$/, "").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  const extension = `.${subtype === "jpeg" ? "jpg" : subtype}`;
  return { ok: true, url: await saveUploadedFile(tenantId, { buffer, originalname: `layout${extension}`, mimetype }, "layouts", extension) };
}

const numberIn = (value: unknown, min: number, max: number): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};

async function validateElements(tenantId: string, value: unknown): Promise<{ ok: true; elements: LayoutElement[] } | { ok: false; error: string }> {
  if (!Array.isArray(value)) return { ok: false, error: "elements harus berupa array" };
  if (value.length > 60) return { ok: false, error: "Terlalu banyak elemen (maks 60 per layar)" };
  const elements: LayoutElement[] = [];
  const seenIds = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "Setiap elemen harus berupa object" };
    const el = raw as Record<string, unknown>;
    const id = String(el.id ?? "").trim();
    if (!id) return { ok: false, error: "Setiap elemen wajib punya id" };
    if (seenIds.has(id)) return { ok: false, error: `Elemen "${id}" muncul dua kali` };
    seenIds.add(id);
    const type = String(el.type) as ElementType;
    if (!VALID_ELEMENT_TYPES.has(type)) return { ok: false, error: `Tipe elemen tidak dikenal: "${el.type}"` };
    for (const key of ["xPct", "yPct", "widthPct", "heightPct"] as const) {
      const num = Number(el[key]);
      if (!Number.isFinite(num) || num < -50 || num > 150) return { ok: false, error: `${key} elemen "${id}" di luar jangkauan` };
    }
    const zIndex = Number(el.zIndex ?? 0);
    if (!Number.isFinite(zIndex)) return { ok: false, error: `zIndex elemen "${id}" tidak valid` };
    const fontSizeVw = numberIn(el.fontSizeVw, 0.3, 40);

    let textContent = el.content === undefined || el.content === null ? undefined : String(el.content);
    let src = el.src === undefined || el.src === null ? undefined : String(el.src);
    // Old custom images kept their picture in `content`; move it to src so everything goes through the same storage.
    if (type === "image" && !src && textContent && (textContent.startsWith("data:") || STORED_URL.test(textContent))) { src = textContent; textContent = undefined; }
    if (textContent !== undefined && textContent.length > MAX_TEXT_LENGTH) {
      return { ok: false, error: `Teks elemen "${id}" terlalu panjang (maks ${MAX_TEXT_LENGTH} karakter)` };
    }
    if (src) {
      const stored = await storeAsset(tenantId, src, id);
      if (!stored.ok) return stored;
      src = stored.url;
    }

    const align = el.align === "left" || el.align === "center" || el.align === "right" ? el.align : undefined;
    const fit = el.fit === "cover" || el.fit === "contain" ? el.fit : undefined;
    const color = typeof el.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(el.color) ? el.color : undefined;
    const scale = numberIn(el.scale, 0.2, 5);
    const rotation = numberIn(el.rotation, -180, 180);
    const opacity = numberIn(el.opacity, 0, 100);
    const radius = numberIn(el.radius, 0, 100);
    const speed = numberIn(el.speed, 3, 120);

    elements.push({
      id,
      type,
      xPct: Number(el.xPct),
      yPct: Number(el.yPct),
      widthPct: Number(el.widthPct),
      heightPct: Number(el.heightPct),
      zIndex,
      ...(fontSizeVw !== undefined ? { fontSizeVw } : {}),
      ...(textContent !== undefined ? { content: textContent } : {}),
      ...(src !== undefined ? { src } : {}),
      ...(scale !== undefined ? { scale } : {}),
      ...(rotation !== undefined ? { rotation } : {}),
      ...(opacity !== undefined ? { opacity } : {}),
      ...(el.hidden === true ? { hidden: true } : {}),
      ...(color ? { color } : {}),
      ...(el.bold === true ? { bold: true } : {}),
      ...(align ? { align } : {}),
      ...(fit ? { fit } : {}),
      ...(radius !== undefined ? { radius } : {}),
      ...(speed !== undefined ? { speed } : {}),
      ...(el.reverse === true ? { reverse: true } : {}),
    });
  }
  return { ok: true, elements };
}

/** Stored files are relative paths for the local driver — the kiosk (often a file:// Electron app) needs absolute URLs. */
function withAbsoluteUrls(elements: LayoutElement[]): LayoutElement[] {
  return elements.map((el) => ({
    ...el,
    ...(el.src ? { src: resolveFrameUrl(el.src) } : {}),
    // legacy custom images saved before `src` existed kept their file in `content`
    ...(el.type === "image" && !el.src && el.content && STORED_URL.test(el.content) ? { src: resolveFrameUrl(el.content), content: undefined } : {}),
  }));
}

// GET /api/config/screen-layout?screenKey=tutorial&orientation=portrait — read the
// saved position overrides for one kiosk screen. requireAnyAuth: the kiosk needs
// this to render, the admin builder needs this to load the editor, and neither is
// guaranteed to hold the other credential.
screenLayoutsRouter.get("/screen-layout", requireAnyAuth, async (req, res) => {
  const screenKey = String(req.query.screenKey ?? "");
  const orientation = String(req.query.orientation ?? "");
  if (!VALID_SCREEN_KEYS.has(screenKey)) return res.status(400).json({ error: "screenKey tidak valid" });
  if (!VALID_ORIENTATIONS.has(orientation)) return res.status(400).json({ error: "orientation tidak valid" });

  // Plan doesn't include Screen Builder — fall back to the default (un-
  // customized) layout instead of serving a saved override. Nothing is
  // deleted: a saved override just comes back automatically if the tenant's
  // plan is ever upgraded again.
  const { screenBuilderEnabled } = await getTenantPlanFeatures(req.tenantId!);
  if (!screenBuilderEnabled) return res.json({ elements: [], updatedAt: null });

  const [row] = await db.select({ elements: screenLayouts.elements, updatedAt: screenLayouts.updatedAt })
    .from(screenLayouts)
    .where(and(eq(screenLayouts.tenantId, req.tenantId!), eq(screenLayouts.screenKey, screenKey), eq(screenLayouts.orientation, orientation)));
  res.json({ elements: withAbsoluteUrls((row?.elements ?? []) as unknown as LayoutElement[]), updatedAt: row?.updatedAt ?? null });
});

// PATCH /api/config/screen-layout — admin saves (or, with an empty array, effectively
// resets) the position overrides for one screen+orientation.
screenLayoutsRouter.patch("/screen-layout", requireAdminAuth, async (req, res) => {
  const screenKey = String(req.body?.screenKey ?? "");
  const orientation = String(req.body?.orientation ?? "");
  if (!VALID_SCREEN_KEYS.has(screenKey)) return res.status(400).json({ error: "screenKey tidak valid" });
  if (!VALID_ORIENTATIONS.has(orientation)) return res.status(400).json({ error: "orientation tidak valid" });

  const { screenBuilderEnabled } = await getTenantPlanFeatures(req.tenantId!);
  if (!screenBuilderEnabled) return res.status(403).json({ error: "Screen Builder tidak termasuk paket kamu saat ini." });

  const validated = await validateElements(req.tenantId!, req.body?.elements);
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  const tenantId = req.tenantId!;
  await db.insert(screenLayouts)
    .values({ tenantId, screenKey, orientation, elements: validated.elements })
    .onConflictDoUpdate({
      target: [screenLayouts.tenantId, screenLayouts.screenKey, screenLayouts.orientation],
      set: { elements: validated.elements, updatedAt: new Date() },
    });
  res.json({ ok: true, elements: withAbsoluteUrls(validated.elements) });
});
