import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./lib/fontPairings";
import { api } from "./lib/api";
import { isKioskPaired } from "./lib/apiConfig";
import { installKioskPreview, IS_KIOSK_PREVIEW } from "./lib/previewMode";

// Opened inside the admin's live-preview frame (?kioskPreview=1): sample data in, nothing real out.
installKioskPreview();

const serialize = (value: unknown) => {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

// A paired kiosk's own app-level errors (e.g. combineSlotClips' catch blocks
// in SesiFoto.tsx) used to only ever exist on that one machine's local
// app.log — nobody at the company would see it unless they went and looked
// at that specific PC. Forwarding console.error to the server (reusing the
// existing platform_events / Superadmin "Aktivitas & Error" log, see
// server/routes/kioskKeys.ts's report-error route) means a fleet-wide crash
// pattern is actually visible from one place. Best-effort and capped — a
// runaway error loop must never turn into a request flood, and a reporting
// failure must never itself throw (that would recurse back into this same
// console.error override).
const ERROR_REPORT_WINDOW_MS = 5 * 60 * 1000;
const ERROR_REPORT_MAX_PER_WINDOW = 10;
let reportWindowStart = Date.now();
let reportCountInWindow = 0;
const recentlyReported = new Map<string, number>();

function reportErrorToServer(message: string, stack: string | undefined) {
  if (IS_KIOSK_PREVIEW || !isKioskPaired()) return;
  const now = Date.now();
  if (now - reportWindowStart > ERROR_REPORT_WINDOW_MS) {
    reportWindowStart = now;
    reportCountInWindow = 0;
    recentlyReported.clear();
  }
  if (reportCountInWindow >= ERROR_REPORT_MAX_PER_WINDOW) return;
  const dedupeKey = message.slice(0, 300);
  const lastSent = recentlyReported.get(dedupeKey);
  if (lastSent && now - lastSent < ERROR_REPORT_WINDOW_MS) return;
  recentlyReported.set(dedupeKey, now);
  reportCountInWindow += 1;
  Promise.resolve(window.studiodo?.getVersion().catch(() => undefined))
    .then((appVersion) => api.reportKioskError({ level: "error", message: message.slice(0, 2000), stack: stack?.slice(0, 4000), appVersion }))
    .catch(() => undefined);
}

// An unattended kiosk window has no reachable DevTools console — without
// this, a renderer-side console.error/warn only ever existed for the instant
// it happened. Forwarding into the same app.log the Electron main process
// already writes to (see electron/main.cjs) means it can be diagnosed from
// the log file afterward. A no-op outside Electron (window.studiodo is only
// injected there).
if (window.studiodo?.logRenderer) {
  const original = { warn: console.warn.bind(console), error: console.error.bind(console) };
  for (const level of ["warn", "error"] as const) {
    console[level] = (...args: unknown[]) => {
      original[level](...args);
      const serialized = args.map(serialize);
      window.studiodo!.logRenderer(level, serialized);
      if (level === "error") {
        const errorArg = args.find((value): value is Error => value instanceof Error);
        reportErrorToServer(serialized.join(" "), errorArg?.stack);
      }
    };
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
