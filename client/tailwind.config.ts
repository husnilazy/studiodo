import type { Config } from "tailwindcss";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default {
  content: [path.join(dir, "index.html"), path.join(dir, "src/**/*.{ts,tsx}")],
  theme: {
    extend: {
      colors: {
        // index.css force-overrides .bg-ink-800/900/950 to follow --kiosk-surface/
        // --kiosk-background, so these are cosmetic fallbacks only — ink.700 is the
        // one shade nothing overrides, so it's the one worth keeping in step with
        // the warm palette (Fase 7) instead of the old cold slate.
        ink: {
          950: "#17130f",
          900: "#1d1712",
          800: "#241e19",
          700: "#2e251e",
        },
        accent: "var(--accent, #D97757)",
      },
      fontFamily: {
        display: "var(--font-display, 'Space Grotesk Variable')",
        body: "var(--font-body, 'Inter Variable')",
      },
      keyframes: {
        flash: {
          "0%": { opacity: "0" },
          "10%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        gradientShift: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        flash: "flash 400ms ease-out",
        gradient: "gradientShift 8s ease infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
