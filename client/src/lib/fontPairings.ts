// Fase 7 — actual, working font loading. Before this, the admin's font dropdown
// wrote a raw string into --font-display that silently fell back to the OS default
// sans unless that exact font happened to be installed — nothing was ever bundled.
// @fontsource packages are self-hosted (bundled by Vite, no runtime network fetch),
// which matters here since the kiosk can run on unreliable venue wifi or fully
// offline. Importing all of them once, unconditionally, avoids FOUC/dynamic-import
// complexity when an admin live-switches pairing — the fixed cost of 4 families in
// one Electron bundle is negligible.
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/inter";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";

export interface FontPairingDef {
  label: string;
  display: string;
  body: string;
}

// Pairings, not lone fonts — a mismatched display/body combo is a bigger visual risk
// than not offering enough choice. "classic" intentionally matches the string every
// pre-Fase-7 tenant already has stored as fontFamily: "Space Grotesk", so migrating
// tenants get the SAME intended look, just one that finally renders.
export const FONT_PAIRINGS = {
  classic: { label: "Classic Clean", display: "'Space Grotesk Variable'", body: "'Inter Variable'" },
  "warm-serif": { label: "Warm Serif", display: "'Fraunces'", body: "'Inter Variable'" },
  "rounded-modern": { label: "Modern Sans", display: "'Plus Jakarta Sans'", body: "'Inter Variable'" },
} satisfies Record<string, FontPairingDef>;

export type FontPairingKey = keyof typeof FONT_PAIRINGS;
