import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { screenLayouts } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { requireAnyAuth } from "../middleware/anyAuth.js";
import { KIOSK_STEP_KEYS } from "../lib/kioskFlowRules.js";
import { getTenantPlanFeatures } from "../lib/planFeatures.js";

export const screenLayoutsRouter = Router();

const VALID_SCREEN_KEYS = new Set<string>([...KIOSK_STEP_KEYS, "idle"]);
const VALID_ORIENTATIONS = new Set(["portrait", "landscape"]);

type ElementType = "system-button" | "text" | "system-steplist" | "image";
const VALID_ELEMENT_TYPES = new Set<ElementType>(["system-button", "text", "system-steplist", "image"]);

interface LayoutElement {
  id: string;
  type: ElementType;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  zIndex: number;
  fontSizeVw?: number;
  content?: string;
}

// 2MB is plenty for a logo PNG as a base64 data URL (~1.5MB of actual image
// data) while keeping a tenant from bloating this row with something huge.
const MAX_CONTENT_LENGTH = 2 * 1024 * 1024;

function validateElements(value: unknown): { ok: true; elements: LayoutElement[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return { ok: false, error: "elements harus berupa array" };
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
      if (!Number.isFinite(num) || num < 0 || num > 100) return { ok: false, error: `${key} elemen "${id}" harus angka 0-100` };
    }
    const zIndex = Number(el.zIndex ?? 0);
    if (!Number.isFinite(zIndex)) return { ok: false, error: `zIndex elemen "${id}" tidak valid` };
    const fontSizeVw = el.fontSizeVw === undefined || el.fontSizeVw === null ? undefined : Number(el.fontSizeVw);
    if (fontSizeVw !== undefined && (!Number.isFinite(fontSizeVw) || fontSizeVw <= 0)) {
      return { ok: false, error: `fontSizeVw elemen "${id}" tidak valid` };
    }
    const content = el.content === undefined || el.content === null ? undefined : String(el.content);
    if (content !== undefined && content.length > MAX_CONTENT_LENGTH) {
      return { ok: false, error: `Konten elemen "${id}" terlalu besar (maks 2MB) — pakai gambar dengan resolusi lebih kecil.` };
    }
    elements.push({
      id,
      type,
      xPct: Number(el.xPct),
      yPct: Number(el.yPct),
      widthPct: Number(el.widthPct),
      heightPct: Number(el.heightPct),
      zIndex,
      ...(fontSizeVw !== undefined ? { fontSizeVw } : {}),
      ...(content !== undefined ? { content } : {}),
    });
  }
  return { ok: true, elements };
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
  res.json({ elements: row?.elements ?? [], updatedAt: row?.updatedAt ?? null });
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

  const validated = validateElements(req.body?.elements);
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  const tenantId = req.tenantId!;
  await db.insert(screenLayouts)
    .values({ tenantId, screenKey, orientation, elements: validated.elements })
    .onConflictDoUpdate({
      target: [screenLayouts.tenantId, screenLayouts.screenKey, screenLayouts.orientation],
      set: { elements: validated.elements, updatedAt: new Date() },
    });
  res.json({ ok: true, elements: validated.elements });
});
