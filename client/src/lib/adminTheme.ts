import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyThemeToDocument, useBoothConfig } from "./boothConfigStore";
import { FONT_PAIRINGS } from "./fontPairings";

// The admin used to inherit whatever look the tenant designed for the CUSTOMER kiosk (a cream/teal serif theme, a red
// frame palette…), so it changed with every redesign and could never have a proper dark/light switch. The admin now
// has its own fixed STUDIODO look, with its own light/dark choice, and gives the tenant's kiosk theme back on exit.

export type AdminThemeMode = "light" | "dark" | "system";

const PALETTES = {
  light: {
    "--accent": "#4f4fe8",
    "--kiosk-background": "#f4f5fb",
    "--kiosk-surface": "#ffffff",
    "--kiosk-text": "#0b1020",
    "--kiosk-muted": "#5b6478",
  },
  dark: {
    "--accent": "#8a8aff",
    "--kiosk-background": "#0a0d18",
    "--kiosk-surface": "#141829",
    "--kiosk-text": "#eceeff",
    "--kiosk-muted": "#9aa3bd",
  },
} as const;

interface AdminPrefs {
  mode: AdminThemeMode;
  /** Show the on-screen keyboard by itself whenever a text field is focused. */
  keyboardAuto: boolean;
  setMode: (mode: AdminThemeMode) => void;
  setKeyboardAuto: (value: boolean) => void;
}

export const useAdminPrefs = create<AdminPrefs>()(
  persist(
    (set) => ({
      mode: "light",
      keyboardAuto: true,
      setMode: (mode) => set({ mode }),
      setKeyboardAuto: (keyboardAuto) => set({ keyboardAuto }),
    }),
    { name: "studiodo-admin-prefs" },
  ),
);

export function resolveAdminTheme(mode: AdminThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyAdminPalette(mode: AdminThemeMode) {
  const root = document.documentElement;
  const resolved = resolveAdminTheme(mode);
  const palette = PALETTES[resolved];
  for (const [name, value] of Object.entries(palette)) root.style.setProperty(name, value);
  root.style.setProperty("--kiosk-gradient-start", palette["--kiosk-background"]);
  root.style.setProperty("--kiosk-gradient-end", palette["--kiosk-background"]);
  root.style.setProperty("--font-display", FONT_PAIRINGS.studiodo.display);
  root.style.setProperty("--font-body", FONT_PAIRINGS.studiodo.body);
  root.dataset.themeMode = resolved;
  root.dataset.adminTheme = resolved;
  // The tenant's button shape rule (`[data-button-style] button`) would otherwise round/square every admin button.
  delete root.dataset.buttonStyle;
  delete root.dataset.buttonSize;
  root.style.removeProperty("--ui-scale");
}

/**
 * Gives the admin its own theme for as long as the calling page is mounted, and restores the tenant's kiosk theme
 * afterwards. Pass `false` for pages that must keep showing the customer-facing design (the screen builder).
 */
export function useAdminThemeScope(enabled = true) {
  const mode = useAdminPrefs((state) => state.mode);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.classList.add("admin-themed");
    applyAdminPalette(mode);
    let media: MediaQueryList | null = null;
    const onSystemChange = () => applyAdminPalette(mode);
    if (mode === "system") {
      media = window.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener("change", onSystemChange);
    }
    return () => media?.removeEventListener("change", onSystemChange);
  }, [enabled, mode]);

  useEffect(() => {
    if (!enabled) return;
    return () => {
      const root = document.documentElement;
      root.classList.remove("admin-themed");
      delete root.dataset.adminTheme;
      applyThemeToDocument(useBoothConfig.getState().config);
    };
  }, [enabled]);
}
