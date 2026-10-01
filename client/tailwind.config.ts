import type { Config } from "tailwindcss";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Theme-aware colors. Every UI color is a CSS variable set from the tenant's theme (see applyThemeToDocument in
// boothConfigStore.ts), so a class like `text-fg/60` or `border-fg/10` is "the text color at 60%" in BOTH light and
// dark mode — unlike the old `text-white/60`, which only ever looked right on a dark background.
// Tailwind 3 can't apply an alpha to a plain `var()` color, so this resolves the alpha with color-mix instead
// (which also makes modifiers like `bg-accent/10` work — they were silently dropped before).
const themed = (variable: string) =>
  ({ opacityValue }: { opacityValue?: string }) => {
    if (opacityValue === undefined || opacityValue.startsWith("var(")) return `var(${variable})`;
    const pct = Math.round(parseFloat(opacityValue) * 1000) / 10;
    return pct >= 100 ? `var(${variable})` : `color-mix(in srgb, var(${variable}) ${pct}%, transparent)`;
  };

export default {
  content: [path.join(dir, "index.html"), path.join(dir, "src/**/*.{ts,tsx}")],
  theme: {
    // The kiosk scales its root font-size up to 26px (index.css), so a 1080px-wide portrait screen has only ~665
    // "design" pixels of room. Tailwind's default px breakpoints (md 768, lg 1024) would switch such a screen to
    // multi-column desktop layouts that then overflow. These values keep the same idea of "wide enough for
    // columns" after accounting for that scaling: a 1080px portrait kiosk stays on the compact layout, while a
    // 1366px laptop or a 1920x1080 landscape kiosk gets the multi-column one.
    screens: {
      sm: "640px",
      md: "1100px",
      lg: "1280px",
      xl: "1600px",
      "2xl": "2000px",
    },
    extend: {
      colors: {
        fg: themed("--kiosk-text"),
        canvas: themed("--kiosk-background"),
        surface: themed("--kiosk-surface"),
        muted: themed("--kiosk-muted"),
        accent: themed("--accent"),
        "on-accent": "#ffffff",
        ink: {
          950: "#0a0d18",
          900: "#0f1322",
          800: "#141829",
          700: "#1d2236",
        },
      },
      fontFamily: {
        display: "var(--font-display, 'Sora Variable')",
        body: "var(--font-body, 'Plus Jakarta Sans')",
      },
      borderRadius: {
        pill: "9999px",
      },
      boxShadow: {
        glass: "0 10px 40px rgba(60, 70, 140, 0.10)",
        lift: "0 24px 60px rgba(60, 70, 140, 0.20)",
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
        floaty: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        popIn: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.12)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        pingSoft: {
          "0%": { transform: "scale(0.9)", opacity: "0.6" },
          "100%": { transform: "scale(2)", opacity: "0" },
        },
      },
      animation: {
        flash: "flash 400ms ease-out",
        gradient: "gradientShift 8s ease infinite",
        floaty: "floaty 6s ease-in-out infinite",
        "pop-in": "popIn 0.5s cubic-bezier(0.3, 1.4, 0.5, 1) both",
        "ping-soft": "pingSoft 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
