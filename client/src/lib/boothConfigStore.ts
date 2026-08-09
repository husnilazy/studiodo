import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CaptureVibe = "Electric" | "Cotton Candy" | "Ocean" | "Sunset" | "Mono";
export type CameraMode = "webcam" | "tether";
export type ButtonStyle = "rounded" | "pill" | "square";
export type KioskDensity = "comfortable" | "compact";
export type SessionLayout = "immersive" | "split" | "centered" | "gallery";
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
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  fontFamily: string;
  buttonStyle: ButtonStyle;
  kioskDensity: KioskDensity;
  sessionLayout: SessionLayout;
  animationsEnabled: boolean;
  promoText: string;
  idleCoverUrl: string | null;
  idleCoverType: "image" | "video";
  idleBannerUrl: string | null;
  idleBannerEnabled: boolean;
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
}

const DEFAULT_CONFIG: BoothConfig = {
  brandName: "STUDIODO",
  tagline: "Capture the moment, cinematically.",
  logoUrl: null,
  accentColor: "#7C3AED",
  backgroundColor: "#07070A",
  surfaceColor: "#14141C",
  textColor: "#FFFFFF",
  mutedTextColor: "#A1A1AA",
  fontFamily: "Space Grotesk",
  buttonStyle: "rounded",
  kioskDensity: "comfortable",
  sessionLayout: "immersive",
  animationsEnabled: true,
  promoText: "Promo hari ini: cetak 2x, gratis 1x!",
  idleCoverUrl: null,
  idleCoverType: "image",
  idleBannerUrl: null,
  idleBannerEnabled: true,
  captureVibe: "Electric",
  countdownSeconds: 3,
  beepEnabled: true,
  sessionTimerMinutes: 5,
  cameraMode: "webcam",
  tetherBridgeUrl: "http://localhost:5513",
  qrisEnabled: true,
  stripLayout: "classic-vertical",
  stripTemplate: "solid",
  outputPresetEnabled: true,
  maxPhotosPerSession: 10,
};

interface BoothConfigStore {
  config: BoothConfig;
  update: (patch: Partial<BoothConfig>) => void;
  reset: () => void;
}

export const useBoothConfig = create<BoothConfigStore>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      update: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
      reset: () => set({ config: DEFAULT_CONFIG }),
    }),
    { name: "studiodo-booth-config" }
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
}
