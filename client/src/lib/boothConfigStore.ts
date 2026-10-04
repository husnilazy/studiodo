import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, getAdminToken } from "./api";
import { DEFAULT_KIOSK_FLOW, type KioskFlowConfig } from "./kioskFlow";
import { LEGACY_ACCENTS, LEGACY_PALETTES, THEME_PRESETS, type ThemeMode } from "./themePresets";
import { FONT_PAIRINGS, type FontPairingKey } from "./fontPairings";

export type CaptureVibe = "Electric" | "Cotton Candy" | "Ocean" | "Sunset" | "Mono";
export type CameraMode = "webcam" | "tether";
export type ButtonStyle = "rounded" | "pill" | "square";
export type ButtonSize = "small" | "medium" | "large";
export type KioskDensity = "comfortable" | "compact";
export type SessionLayout = "immersive" | "split" | "centered" | "gallery";
export type KioskPageKey = "idle" | "packages" | "orientation" | "payment" | "capture" | "preview" | "frame" | "result";
export type KioskBackgroundStyle = "ambient" | "solid" | "cover";
export type StripLayout =
  | "classic-vertical"
  | "classic-3cut"
  | "grid-2x2"
  | "grid-2x3"
  | "wide-filmstrip"
  | "polaroid"
  | "4r";
export type StripVisualTemplate =
  | "solid"
  | "gradient"
  | "pastel-pop"
  | "sunset"
  | "neon-glow"
  | "film-noir"
  | "retro-cream"
  | "confetti"
  | "mint-fresh"
  | "bubblegum";

export interface BoothConfig {
  brandName: string;
  tagline: string;
  logoUrl: string | null;
  contactWhatsapp: string;
  socialInstagram: string;
  socialTiktok: string;
  socialFacebook: string;
  websiteUrl: string;
  address: string;
  logoScale: number;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  fontFamily: string;
  themeMode: ThemeMode;
  fontPairing: FontPairingKey;
  eventEnabled: boolean;
  eventName: string;
  eventDescription: string;
  eventImageUrl: string | null;
  eventStartAt: string;
  eventEndAt: string;
  eventFreeEntry: boolean;
  eventTimerEnabled: boolean;
  eventSessionTimerMinutes: number;
  eventMaxPhotosPerSession: number;
  eventHasGif: boolean;
  eventHasVideo: boolean;
  buttonStyle: ButtonStyle;
  buttonSize: ButtonSize;
  /** Whole-kiosk text/element scale in percent (90–130); 100 = the automatic screen-based size. */
  uiScale: number;
  kioskDensity: KioskDensity;
  sessionLayout: SessionLayout;
  backgroundStyle: KioskBackgroundStyle;
  backgroundGradientEnabled: boolean;
  backgroundGradientStart: string;
  backgroundGradientEnd: string;
  animationsEnabled: boolean;
  keyboardScale: number;
  promoText: string;
  idleStartText: string;
  idleHeadline: string;
  idleSubheadline: string;
  idleShowHeadline: boolean;
  idleShowSubheadline: boolean;
  packageHeadline: string;
  orientationHeadline: string;
  paymentHeadline: string;
  captureHeadline: string;
  previewHeadline: string;
  frameHeadline: string;
  resultHeadline: string;
  idleCoverUrl: string | null;
  idleCoverType: "image" | "video";
  idleBannerUrl: string | null;
  idleBannerEnabled: boolean;
  enabledPages: Record<KioskPageKey, boolean>;
  features: {
    tutorialEnabled: boolean;
    packageExtras: boolean;
    orientationChoice: boolean;
    qrisPayment: boolean;
    voucherPayment: boolean;
    frameChoice: boolean;
    filters: boolean;
    retake: boolean;
    advancedPhotoEditor: boolean;
    stickers: boolean;
    customerForm: boolean;
    shareQr: boolean;
    download: boolean;
    print: boolean;
    mediaRecording: boolean;
  };
  captureVibe: CaptureVibe;
  countdownSeconds: number;
  beepEnabled: boolean;
  // When on, the kiosk fires each shot's countdown itself (a short pause
  // after the previous photo, then it counts down again) instead of waiting
  // for the customer to tap the shutter for every single photo.
  autoCaptureEnabled: boolean;
  sessionTimerMinutes: number;
  cameraMode: CameraMode;
  tetherBridgeUrl: string;
  qrisEnabled: boolean;
  stripLayout: StripLayout;
  stripTemplate: StripVisualTemplate;
  outputPresetEnabled: boolean;
  /** Frame (a template saved in the "stop motion" category) used for the stop-motion video; null = plain photo. */
  stopMotionTemplateId: string | null;
  /** How long each photo stays on screen in the stop-motion video. */
  stopMotionSecondsPerPhoto: number;
  maxPhotosPerSession: number;
  autoPrintEnabled: boolean;
  printCopies: number;
  printerName: string | null;
  offlineModeEnabled: boolean;
  kioskFlow: KioskFlowConfig;
}

const DEFAULT_CONFIG: BoothConfig = {
  brandName: "STUDIODO",
  tagline: "Abadikan momen, bagikan senyum.",
  logoUrl: null,
  contactWhatsapp: "",
  socialInstagram: "",
  socialTiktok: "",
  socialFacebook: "",
  websiteUrl: "",
  address: "",
  logoScale: 100,
  accentColor: THEME_PRESETS.light.accentColor,
  backgroundColor: THEME_PRESETS.light.backgroundColor,
  surfaceColor: THEME_PRESETS.light.surfaceColor,
  textColor: THEME_PRESETS.light.textColor,
  mutedTextColor: THEME_PRESETS.light.mutedTextColor,
  fontFamily: "Sora",
  themeMode: "light",
  fontPairing: "studiodo",
  eventEnabled: false,
  eventName: "Event Spesial",
  eventDescription: "Acara khusus studio hari ini.",
  eventImageUrl: null,
  eventStartAt: "",
  eventEndAt: "",
  eventFreeEntry: true,
  eventTimerEnabled: true,
  eventSessionTimerMinutes: 5,
  eventMaxPhotosPerSession: 0,
  eventHasGif: false,
  eventHasVideo: true,
  buttonStyle: "rounded",
  buttonSize: "medium",
  uiScale: 100,
  kioskDensity: "comfortable",
  sessionLayout: "immersive",
  backgroundStyle: "ambient",
  backgroundGradientEnabled: true,
  backgroundGradientStart: THEME_PRESETS.light.backgroundGradientStart,
  backgroundGradientEnd: THEME_PRESETS.light.backgroundGradientEnd,
  animationsEnabled: true,
  keyboardScale: 100,
  promoText: "Promo hari ini: cetak 2x, gratis 1x!",
  idleStartText: "Sentuh layar untuk mulai",
  idleHeadline: "STUDIODO",
  idleSubheadline: "Abadikan momen, bagikan senyum.",
  idleShowHeadline: true,
  idleShowSubheadline: true,
  packageHeadline: "Pilih Paket",
  orientationHeadline: "Tampilan Kamera",
  paymentHeadline: "Pembayaran",
  captureHeadline: "Siap untuk momenmu?",
  previewHeadline: "Momenmu, siap diedit.",
  frameHeadline: "Pilih Frame",
  resultHeadline: "Hasil fotomu sudah siap.",
  idleCoverUrl: null,
  idleCoverType: "image",
  idleBannerUrl: null,
  idleBannerEnabled: true,
  enabledPages: {
    idle: true,
    packages: true,
    orientation: true,
    payment: true,
    capture: true,
    preview: true,
    frame: true,
    result: true,
  },
  features: {
    tutorialEnabled: false,
    packageExtras: true,
    orientationChoice: true,
    qrisPayment: true,
    voucherPayment: true,
    frameChoice: true,
    filters: true,
    retake: true,
    advancedPhotoEditor: true,
    stickers: true,
    customerForm: true,
    shareQr: true,
    download: true,
    print: true,
    mediaRecording: true,
  },
  captureVibe: "Electric",
  countdownSeconds: 3,
  beepEnabled: true,
  autoCaptureEnabled: false,
  sessionTimerMinutes: 5,
  cameraMode: "webcam",
  tetherBridgeUrl: "http://localhost:5510",
  qrisEnabled: true,
  stripLayout: "classic-vertical",
  stripTemplate: "solid",
  outputPresetEnabled: true,
  stopMotionTemplateId: null,
  stopMotionSecondsPerPhoto: 0.9,
  maxPhotosPerSession: 10,
  autoPrintEnabled: true,
  printCopies: 1,
  printerName: null,
  offlineModeEnabled: false,
  kioskFlow: DEFAULT_KIOSK_FLOW,
};

interface BoothConfigStore {
  config: BoothConfig;
  update: (patch: Partial<BoothConfig>) => void;
  reset: () => void;
}

/** Upgrades a theme that was never customized (still the pre-redesign clay palette) to the website look. */
function upgradeLegacyTheme(config: Partial<BoothConfig> | undefined): Partial<BoothConfig> | undefined {
  if (!config) return config;
  const next: Partial<BoothConfig> = { ...config };
  const same = (a?: string, b?: string) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
  const untouchedPalette = LEGACY_PALETTES.some((p) => same(p.backgroundColor, config.backgroundColor) && same(p.surfaceColor, config.surfaceColor) && same(p.textColor, config.textColor));
  if (untouchedPalette) Object.assign(next, THEME_PRESETS.light, { themeMode: "light" as ThemeMode });
  if (config.accentColor && LEGACY_ACCENTS.includes(config.accentColor.toUpperCase())) next.accentColor = THEME_PRESETS.light.accentColor;
  if ((config.fontPairing as string | undefined) === "classic" || !config.fontPairing) next.fontPairing = "studiodo";
  if (config.tagline === "Capture the moment, cinematically.") next.tagline = DEFAULT_CONFIG.tagline;
  if (config.idleSubheadline === "Capture the moment, cinematically.") next.idleSubheadline = DEFAULT_CONFIG.idleSubheadline;
  if (config.orientationHeadline === "Pilih Orientasi") next.orientationHeadline = DEFAULT_CONFIG.orientationHeadline;
  return next;
}

function mergeConfig(config?: Partial<BoothConfig>): BoothConfig {
  const tetherBridgeUrl = config?.tetherBridgeUrl?.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1):5513\/?$/, "$1$2:5510") ?? DEFAULT_CONFIG.tetherBridgeUrl;
  return {
    ...DEFAULT_CONFIG,
    ...config,
    tetherBridgeUrl,
    enabledPages: { ...DEFAULT_CONFIG.enabledPages, ...(config?.enabledPages ?? {}) },
    features: { ...DEFAULT_CONFIG.features, ...(config?.features ?? {}) },
    // Server sends `null` (not just "missing") for tenants that never configured
    // this — a plain spread would let that null clobber the default, so fall back
    // explicitly. Also guards against a malformed/partial order (wrong length) by
    // discarding it wholesale rather than mixing it with defaults, which could
    // silently produce an invalid order the validator would never have allowed.
    kioskFlow: config?.kioskFlow && Array.isArray(config.kioskFlow.order) && config.kioskFlow.order.length === DEFAULT_KIOSK_FLOW.order.length
      ? { order: config.kioskFlow.order, enabled: { ...DEFAULT_KIOSK_FLOW.enabled, ...(config.kioskFlow.enabled ?? {}) } }
      : DEFAULT_KIOSK_FLOW,
  };
}

export const useBoothConfig = create<BoothConfigStore>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      update: (patch) => set((s) => ({ config: mergeConfig({ ...s.config, ...patch }) })),
      reset: () => set({ config: DEFAULT_CONFIG }),
    }),
    {
      name: "studiodo-booth-config",
      version: 2,
      // v2 = website redesign. Only a stored pre-v2 theme is upgraded; v2+ configs are the tenant's own choices.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<BoothConfigStore>;
        return { ...p, config: mergeConfig(upgradeLegacyTheme(p.config)) } as BoothConfigStore;
      },
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<BoothConfigStore>),
        config: mergeConfig((persisted as Partial<BoothConfigStore>)?.config),
      }),
    }
  )
);

// Settings that belong to ONE physical booth, not to the tenant: another kiosk of the same tenant may have a different
// camera or printer, so these stay in this PC's localStorage and are never uploaded or overwritten.
const DEVICE_LOCAL_KEYS: (keyof BoothConfig)[] = ["cameraMode", "tetherBridgeUrl", "printerName", "offlineModeEnabled", "kioskFlow"];
// Profile columns the server has always stored (set from "Profil Gallery"); applied first, the design config on top.
const PROFILE_KEYS = ["brandName", "tagline", "logoUrl", "contactWhatsapp", "socialInstagram", "socialTiktok", "socialFacebook", "websiteUrl", "address"] as const;

// True while WE are writing server data into the store, so that write is not mistaken for an admin edit and pushed back.
let applyingRemote = false;

export type ConfigSyncState = { status: "idle" | "saving" | "saved" | "error"; message?: string };
export const useConfigSync = create<ConfigSyncState>(() => ({ status: "idle" }));

/**
 * Loads the paired tenant's design from the server at boot / admin login.
 *
 * It used to copy EVERY server column over the local settings — columns nothing ever wrote to, still holding their
 * defaults (violet accent, no logo, 3s countdown …). That is why a tenant's colors and logo "reset themselves" the next
 * day. Now only data that really exists on the server is applied: the saved design (kioskConfig), the profile fields
 * that were actually filled in, and the flow. Anything the server doesn't have stays as it is on this device.
 */
export async function syncBoothConfigFromServer(): Promise<{ hadServerConfig: boolean }> {
  // Deliberately NOT swallowed here — KioskPairing.tsx relies on this throwing to detect a bad/typo'd kiosk key.
  const remote = (await api.getTenantConfig()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of PROFILE_KEYS) {
    const value = remote[key];
    if (typeof value === "string" && value.trim() !== "") patch[key] = value;
  }
  const design = remote.kioskConfig && typeof remote.kioskConfig === "object" ? (remote.kioskConfig as Record<string, unknown>) : null;
  if (design) {
    for (const [key, value] of Object.entries(design)) {
      if (!DEVICE_LOCAL_KEYS.includes(key as keyof BoothConfig)) patch[key] = value;
    }
  }
  if (remote.kioskFlow) patch.kioskFlow = remote.kioskFlow;

  applyingRemote = true;
  try {
    useBoothConfig.getState().update(patch as Partial<BoothConfig>);
  } finally {
    applyingRemote = false;
  }
  return { hadServerConfig: design !== null };
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** Uploads this device's design to the server right now (admin only). */
export async function pushConfigNow(): Promise<boolean> {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  if (!getAdminToken()) return false;
  const config = useBoothConfig.getState().config as unknown as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (!DEVICE_LOCAL_KEYS.includes(key as keyof BoothConfig)) body[key] = value;
  }
  useConfigSync.setState({ status: "saving", message: undefined });
  try {
    const result = await api.saveKioskConfig(body);
    // The server moved uploaded images to file storage: swap our multi-MB data: URIs for the real URLs.
    const images = result?.images ?? {};
    if (Object.keys(images).length > 0) {
      applyingRemote = true;
      try { useBoothConfig.getState().update(images as Partial<BoothConfig>); } finally { applyingRemote = false; }
    }
    useConfigSync.setState({ status: "saved" });
    return true;
  } catch (error) {
    useConfigSync.setState({ status: "error", message: error instanceof Error ? error.message : "Gagal menyimpan ke server" });
    return false;
  }
}

/** Debounced version used while the admin is editing: waits for a pause so every keystroke isn't a request. */
export function schedulePush() {
  if (!getAdminToken()) return;
  useConfigSync.setState({ status: "saving", message: undefined });
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { void pushConfigNow(); }, 1500);
}

// Any change made while an admin is logged in is saved to the server automatically — no separate "save to all kiosks" step.
useBoothConfig.subscribe((state, prev) => {
  if (applyingRemote || state.config === prev.config) return;
  schedulePush();
});

export function isEventActive(config: BoothConfig) {
  if (!config.eventEnabled) return false;
  const now = Date.now();
  if (config.eventStartAt) {
    const start = new Date(config.eventStartAt).getTime();
    if (!Number.isNaN(start) && now < start) return false;
  }
  if (config.eventEndAt) {
    const end = new Date(config.eventEndAt).getTime();
    if (!Number.isNaN(end) && now > end) return false;
  }
  return true;
}

/**
 * Bulk-fill the manual color fields from one of the two built-in palettes.
 * Switching `themeMode` alone does NOT do this (it only flips the structural
 * `data-theme-mode` CSS branching) — tenants that already hand-picked colors
 * shouldn't lose them just by toggling dark/light. This is an explicit,
 * admin-triggered convenience for starting from a sane default.
 */
export function applyThemePreset(mode: ThemeMode) {
  useBoothConfig.getState().update({ themeMode: mode, ...THEME_PRESETS[mode] });
}

/** Apply accent color / font as CSS variables so every custom-styled screen picks it up live. */
export function applyThemeToDocument(config: BoothConfig) {
  const root = document.documentElement;
  root.style.setProperty("--accent", config.accentColor);
  root.style.setProperty("--kiosk-background", config.backgroundColor);
  root.style.setProperty("--kiosk-surface", config.surfaceColor);
  root.style.setProperty("--kiosk-text", config.textColor);
  root.style.setProperty("--kiosk-muted", config.mutedTextColor);
  const pairing = FONT_PAIRINGS[config.fontPairing] ?? FONT_PAIRINGS.studiodo;
  root.style.setProperty("--font-display", pairing.display);
  root.style.setProperty("--font-body", pairing.body);
  root.dataset.themeMode = config.themeMode ?? "light";
  root.dataset.buttonStyle = config.buttonStyle;
  root.dataset.buttonSize = config.buttonSize ?? "medium";
  root.style.setProperty("--ui-scale", String(Math.max(80, Math.min(140, config.uiScale ?? 100)) / 100));
  root.dataset.kioskDensity = config.kioskDensity;
  root.dataset.animations = String(config.animationsEnabled);
  root.dataset.sessionLayout = config.sessionLayout ?? "immersive";
  root.dataset.backgroundStyle = config.backgroundStyle ?? "ambient";
  root.dataset.backgroundGradient = String(config.backgroundGradientEnabled ?? true);
  root.style.setProperty("--kiosk-gradient-start", config.backgroundGradientStart ?? config.backgroundColor);
  root.style.setProperty("--kiosk-gradient-end", config.backgroundGradientEnd ?? config.surfaceColor);
  root.style.setProperty("--logo-scale", `${Math.max(60, Math.min(180, config.logoScale ?? 100))}%`);
  root.style.setProperty("--keyboard-scale", String(Math.max(80, Math.min(140, config.keyboardScale ?? 100)) / 100));
}
