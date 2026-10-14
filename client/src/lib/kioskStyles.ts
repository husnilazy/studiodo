import type { BoothConfig } from "./boothConfigStore";

// "Gaya kiosk": a style is a whole look from the idle screen to the result screen, not just a palette. It drives
//  - CSS (index.css, [data-kiosk-style="…"]): surfaces, borders, shadows, buttons, type weight, motion;
//  - screen LAYOUTS: the idle screen and the package picker are composed differently per style.
// The tenant can still override the two layouts independently ("auto" = follow the style) and tune colors/fonts as before.

export type KioskStyleId = "default" | "minimal" | "immersive" | "playful" | "fun" | "fullcam";
export type IdleLayoutId = "auto" | "center" | "left" | "fullbleed" | "split";
export type PackageLayoutId = "auto" | "grid" | "list" | "carousel";
/** "panels" = camera with side panels; "fullscreen" = live view fills the screen and every control floats transparently on top. */
export type CaptureLayoutId = "auto" | "panels" | "fullscreen";

type StylePalette = Pick<
  BoothConfig,
  "themeMode" | "accentColor" | "backgroundColor" | "surfaceColor" | "textColor" | "mutedTextColor" | "backgroundGradientStart" | "backgroundGradientEnd" | "backgroundGradientEnabled" | "fontPairing" | "buttonStyle"
>;

export interface KioskStyleDef {
  label: string;
  tagline: string;
  description: string;
  idle: Exclude<IdleLayoutId, "auto">;
  packages: Exclude<PackageLayoutId, "auto">;
  capture: Exclude<CaptureLayoutId, "auto">;
  /** Recommended colors/fonts/button shape; applied only when the admin asks for them. */
  palette: StylePalette;
}

export const KIOSK_STYLES: Record<KioskStyleId, KioskStyleDef> = {
  default: {
    label: "Default",
    tagline: "Kaca & gradasi lembut",
    description: "Tampilan STUDIODO: panel kaca, bola warna pastel, tombol kapsul. Cocok untuk hampir semua studio.",
    idle: "center",
    packages: "grid",
    capture: "panels",
    palette: { themeMode: "light", accentColor: "#4F4FE8", backgroundColor: "#FAFAFD", surfaceColor: "#FFFFFF", textColor: "#0B1020", mutedTextColor: "#5B6478", backgroundGradientStart: "#FAFAFD", backgroundGradientEnd: "#EEF0FF", backgroundGradientEnabled: true, fontPairing: "studiodo", buttonStyle: "rounded" },
  },
  minimal: {
    label: "Minimalis",
    tagline: "Bersih, rata kiri, tanpa dekorasi",
    description: "Latar polos, garis tipis, tulisan besar rata kiri, daftar paket berbaris. Tenang seperti aplikasi photobooth modern.",
    idle: "left",
    packages: "list",
    capture: "panels",
    palette: { themeMode: "light", accentColor: "#111827", backgroundColor: "#FFFFFF", surfaceColor: "#F6F6F8", textColor: "#0B0B0F", mutedTextColor: "#6B7280", backgroundGradientStart: "#FFFFFF", backgroundGradientEnd: "#FFFFFF", backgroundGradientEnabled: false, fontPairing: "rounded-modern", buttonStyle: "square" },
  },
  immersive: {
    label: "Sinematik",
    tagline: "Gelap, foto layar penuh",
    description: "Foto/video cover memenuhi layar awal, tombol besar di bawah, paket digeser menyamping. Terasa seperti kamera.",
    idle: "fullbleed",
    packages: "carousel",
    capture: "fullscreen",
    palette: { themeMode: "dark", accentColor: "#FF4D6D", backgroundColor: "#07080C", surfaceColor: "#13151D", textColor: "#FFFFFF", mutedTextColor: "#A3A8B8", backgroundGradientStart: "#07080C", backgroundGradientEnd: "#161826", backgroundGradientEnabled: true, fontPairing: "classic", buttonStyle: "pill" },
  },
  playful: {
    label: "Ceria",
    tagline: "Tebal, berwarna, penuh karakter",
    description: "Garis tebal, bayangan keras, kartu sedikit miring, layar awal terbelah. Pas untuk event, sweet seventeen, dan anak muda.",
    idle: "split",
    packages: "grid",
    capture: "panels",
    palette: { themeMode: "light", accentColor: "#FF5C8A", backgroundColor: "#FFF6E5", surfaceColor: "#FFFFFF", textColor: "#1B1233", mutedTextColor: "#6B5E80", backgroundGradientStart: "#FFF6E5", backgroundGradientEnd: "#FFE0EC", backgroundGradientEnabled: true, fontPairing: "rounded-modern", buttonStyle: "rounded" },
  },
  fun: {
    label: "Seru!",
    tagline: "Warna-warni, memantul, penuh stiker",
    description: "Latar ungu-kuning cerah, tombol besar yang memantul, hitung mundur meledak seperti konfeti. Untuk anak muda, pesta, dan mal.",
    idle: "center",
    packages: "carousel",
    capture: "panels",
    palette: { themeMode: "light", accentColor: "#7C3AED", backgroundColor: "#FFF3B0", surfaceColor: "#FFFFFF", textColor: "#241046", mutedTextColor: "#6B4FA0", backgroundGradientStart: "#FFE066", backgroundGradientEnd: "#FF9ECF", backgroundGradientEnabled: true, fontPairing: "rounded-modern", buttonStyle: "pill" },
  },
  fullcam: {
    label: "Kamera penuh",
    tagline: "Live view layar penuh, tombol transparan",
    description: "Kamera memenuhi seluruh layar. Tombol, galeri jepretan, dan filter melayang transparan di atasnya supaya pelanggan fokus ke pose.",
    idle: "fullbleed",
    packages: "grid",
    capture: "fullscreen",
    palette: { themeMode: "dark", accentColor: "#FFFFFF", backgroundColor: "#050506", surfaceColor: "#14151A", textColor: "#FFFFFF", mutedTextColor: "#B4B8C4", backgroundGradientStart: "#050506", backgroundGradientEnd: "#0E0F14", backgroundGradientEnabled: false, fontPairing: "classic", buttonStyle: "pill" },
  },
};

export const KIOSK_STYLE_IDS = Object.keys(KIOSK_STYLES) as KioskStyleId[];

export const IDLE_LAYOUT_LABEL: Record<Exclude<IdleLayoutId, "auto">, string> = {
  center: "Tengah",
  left: "Rata kiri",
  fullbleed: "Layar penuh",
  split: "Terbelah",
};
export const PACKAGE_LAYOUT_LABEL: Record<Exclude<PackageLayoutId, "auto">, string> = {
  grid: "Kartu",
  list: "Daftar",
  carousel: "Geser",
};

export function resolveKioskStyle(config: Pick<BoothConfig, "kioskStyle">): KioskStyleId {
  return config.kioskStyle && config.kioskStyle in KIOSK_STYLES ? config.kioskStyle : "default";
}

export function resolveIdleLayout(config: Pick<BoothConfig, "kioskStyle" | "idleLayout">): Exclude<IdleLayoutId, "auto"> {
  if (config.idleLayout && config.idleLayout !== "auto" && config.idleLayout in IDLE_LAYOUT_LABEL) return config.idleLayout;
  return KIOSK_STYLES[resolveKioskStyle(config)].idle;
}

export const CAPTURE_LAYOUT_LABEL: Record<Exclude<CaptureLayoutId, "auto">, string> = {
  panels: "Dengan panel",
  fullscreen: "Layar penuh",
};

export function resolveCaptureLayout(config: Pick<BoothConfig, "kioskStyle" | "captureLayout">): Exclude<CaptureLayoutId, "auto"> {
  if (config.captureLayout && config.captureLayout !== "auto" && config.captureLayout in CAPTURE_LAYOUT_LABEL) return config.captureLayout;
  return KIOSK_STYLES[resolveKioskStyle(config)].capture;
}

export function resolvePackageLayout(config: Pick<BoothConfig, "kioskStyle" | "packageLayout">): Exclude<PackageLayoutId, "auto"> {
  if (config.packageLayout && config.packageLayout !== "auto" && config.packageLayout in PACKAGE_LAYOUT_LABEL) return config.packageLayout;
  return KIOSK_STYLES[resolveKioskStyle(config)].packages;
}
