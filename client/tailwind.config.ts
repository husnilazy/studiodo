import type { Config } from "tailwindcss";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default {
  content: [path.join(dir, "index.html"), path.join(dir, "src/**/*.{ts,tsx}")],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#07070a",
          900: "#0d0d12",
          800: "#15151d",
          700: "#1f1f2b",
        },
        accent: "var(--accent, #7C3AED)",
      },
      fontFamily: {
        display: "var(--font-display, 'Space Grotesk')",
        body: "var(--font-body, 'Inter')",
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
