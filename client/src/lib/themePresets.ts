import type { BoothConfig } from "./boothConfigStore";

export type ThemeMode = "dark" | "light";

type ThemeColorFields = Pick<
  BoothConfig,
  "accentColor" | "backgroundColor" | "surfaceColor" | "textColor" | "mutedTextColor" | "backgroundGradientStart" | "backgroundGradientEnd"
>;

// Fase 7 — two coherent, admin-selectable base palettes. Kept as plain data (not
// store logic) so tuning colors never touches boothConfigStore.ts. Accent stays
// identical across both modes on purpose: brand continuity, and it's the one color
// field that's actually synced to the server (see server/routes/config.ts).
export const THEME_PRESETS: Record<ThemeMode, ThemeColorFields> = {
  dark: {
    accentColor: "#D97757",
    backgroundColor: "#17130F",
    surfaceColor: "#241E19",
    textColor: "#F5EFE9",
    mutedTextColor: "#B8AA9C",
    backgroundGradientStart: "#17130F",
    backgroundGradientEnd: "#2B1D14",
  },
  light: {
    accentColor: "#D97757",
    backgroundColor: "#FBF6EF",
    surfaceColor: "#FFFDF9",
    textColor: "#2B211A",
    mutedTextColor: "#8A7C6E",
    backgroundGradientStart: "#FBF6EF",
    backgroundGradientEnd: "#F3E4D4",
  },
};
