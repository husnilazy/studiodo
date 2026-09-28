import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "./api";
import { DEFAULT_KIOSK_FLOW, type KioskFlowConfig } from "./kioskFlow";
import { THEME_PRESETS, type ThemeMode } from "./themePresets";
import { FONT_PAIRINGS, type FontPairingKey } from "./fontPairings";

export type CaptureVibe = "Electric" | "Cotton Candy" | "Ocean" | "Sunset" | "Mono";
export type CameraMode = "webcam" | "tether";
export type ButtonStyle = "rounded" | "pill" | "square";
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
  maxPhotosPerSession: number;
  autoPrintEnabled: boolean;
  printCopies: number;
  printerName: string | null;
  offlineModeEnabled: boolean;
  kioskFlow: KioskFlowConfig;
}

const DEFAULT_CONFIG: BoothConfig = {
  brandName: "STUDIODO",
  tagline: "Capture the moment, cinematically.",
  logoUrl: null,
  contactWhatsapp: "",
  socialInstagram: "",
  socialTiktok: "",
  socialFacebook: "",
  websiteUrl: "",
  address: "",
  logoScale: 100,
  accentColor: "#D97757",
  backgroundColor: "#17130F",
  surfaceColor: "#241E19",
  textColor: "#F5EFE9",
  mutedTextColor: "#B8AA9C",
  fontFamily: "Space Grotesk",
  themeMode: "dark",
  fontPairing: "classic",
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
  kioskDensity: "comfortable",
  sessionLayout: "immersive",
  backgroundStyle: "ambient",
  backgroundGradientEnabled: true,
  backgroundGradientStart: "#17130F",
  backgroundGradientEnd: "#2B1D14",
  animationsEnabled: true,
  keyboardScale: 100,
  promoText: "Promo hari ini: cetak 2x, gratis 1x!",
  idleStartText: "Sentuh layar untuk mulai",
  idleHeadline: "STUDIODO",
  idleSubheadline: "Capture the moment, cinematically.",
  packageHeadline: "Pilih Paket",
  orientationHeadline: "Pilih Orientasi",
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
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<BoothConfigStore>),
        config: mergeConfig((persisted as Partial<BoothConfigStore>)?.config),
      }),
    }
  )
);

/**
 * Overwrite the persisted local config with the paired tenant's server-side
 * branding once a kiosk key/admin login is confirmed. Needed now that the
 * same physical kiosk (and its localStorage) could be re-paired to a
 * different tenant later — otherwise the old tenant's branding would linger.
 */
export async function syncBoothConfigFromServer() {
  // Deliberately NOT swallowed here — KioskPairing.tsx relies on this
  // throwing to detect a bad/typo'd kiosk key. It used to catch-and-return
  // silently, so a wrong key still got persisted as "paired" and only failed
  // later, mid-flow, with a generic error instead of bouncing back to setup.
  const remote = await api.getTenantConfig();
  useBoothConfig.getState().update(remote as Partial<BoothConfig>);
}

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
  const pairing = FONT_PAIRINGS[config.fontPairing] ?? FONT_PAIRINGS.classic;
  root.style.setProperty("--font-display", pairing.display);
  root.style.setProperty("--font-body", pairing.body);
  root.dataset.themeMode = config.themeMode ?? "dark";
  root.dataset.buttonStyle = config.buttonStyle;
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
