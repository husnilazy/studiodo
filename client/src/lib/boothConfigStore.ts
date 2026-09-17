import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  logoScale: number;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  fontFamily: string;
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
}

const DEFAULT_CONFIG: BoothConfig = {
  brandName: "STUDIODO",
  tagline: "Capture the moment, cinematically.",
  logoUrl: null,
  logoScale: 100,
  accentColor: "#7C3AED",
  backgroundColor: "#07070A",
  surfaceColor: "#14141C",
  textColor: "#FFFFFF",
  mutedTextColor: "#A1A1AA",
  fontFamily: "Space Grotesk",
  buttonStyle: "rounded",
  kioskDensity: "comfortable",
  sessionLayout: "immersive",
  backgroundStyle: "ambient",
  backgroundGradientEnabled: true,
  backgroundGradientStart: "#07070A",
  backgroundGradientEnd: "#123047",
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

/** Apply accent color / font as CSS variables so every custom-styled screen picks it up live. */
export function applyThemeToDocument(config: BoothConfig) {
  const root = document.documentElement;
  root.style.setProperty("--accent", config.accentColor);
  root.style.setProperty("--kiosk-background", config.backgroundColor);
  root.style.setProperty("--kiosk-surface", config.surfaceColor);
  root.style.setProperty("--kiosk-text", config.textColor);
  root.style.setProperty("--kiosk-muted", config.mutedTextColor);
  root.style.setProperty("--font-display", `'${config.fontFamily}'`);
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
