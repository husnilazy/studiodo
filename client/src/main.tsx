import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./lib/fontPairings";

// An unattended kiosk window has no reachable DevTools console — without
// this, a renderer-side console.error/warn (e.g. combineSlotClips' own catch
// blocks in SesiFoto.tsx) only ever existed for the instant it happened.
// Forwarding into the same app.log the Electron main process already writes
// to (see electron/main.cjs) means a "why did the combined GIF/video not
// show up" report can actually be diagnosed from the log file afterward. A
// no-op outside Electron (window.studiodo is only injected there).
if (window.studiodo?.logRenderer) {
  const original = { warn: console.warn.bind(console), error: console.error.bind(console) };
  const serialize = (value: unknown) => {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };
  for (const level of ["warn", "error"] as const) {
    console[level] = (...args: unknown[]) => {
      original[level](...args);
      window.studiodo!.logRenderer(level, args.map(serialize));
    };
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
