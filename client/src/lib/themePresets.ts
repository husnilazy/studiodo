import type { BoothConfig } from "./boothConfigStore";

export type ThemeMode = "dark" | "light";

type ThemeColorFields = Pick<
  BoothConfig,
  "accentColor" | "backgroundColor" | "surfaceColor" | "textColor" | "mutedTextColor" | "backgroundGradientStart" | "backgroundGradientEnd"
>;

// Two coherent base palettes, both taken from the STUDIODO website (white minimalist + glass over pastel blobs,
// indigo accent). Light is the default. Kept as plain data so tuning colors never touches boothConfigStore.ts.
export const THEME_PRESETS: Record<ThemeMode, ThemeColorFields> = {
  light: {
    accentColor: "#4F4FE8",
    backgroundColor: "#FAFAFD",
    surfaceColor: "#FFFFFF",
    textColor: "#0B1020",
    mutedTextColor: "#5B6478",
    backgroundGradientStart: "#FAFAFD",
    backgroundGradientEnd: "#EEF0FF",
  },
  dark: {
    accentColor: "#8A8AFF",
    backgroundColor: "#0A0D18",
    surfaceColor: "#141829",
    textColor: "#ECEEFF",
    mutedTextColor: "#9AA3BD",
    backgroundGradientStart: "#0A0D18",
    backgroundGradientEnd: "#151A33",
  },
};

// The palettes shipped before the redesign (warm clay). A saved theme that still equals one of these was never
// customized by the tenant, so it is upgraded to the new look; anything else is the tenant's own choice and is kept.
export const LEGACY_PALETTES: Partial<ThemeColorFields>[] = [
  { backgroundColor: "#17130F", surfaceColor: "#241E19", textColor: "#F5EFE9" },
  { backgroundColor: "#FBF6EF", surfaceColor: "#FFFDF9", textColor: "#2B211A" },
];
// Accent defaults of old versions (client clay, server violet): "never picked an accent".
export const LEGACY_ACCENTS = ["#D97757", "#7C3AED"];
