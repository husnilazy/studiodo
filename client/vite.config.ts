import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Content-Security-Policy for the built app (Electron loads it from file://, the API host serves it to browsers).
// Scripts may only come from the bundle itself, so injected markup can never run code; plugins/objects/forms are off.
// https: stays open for connect/img/media because tenants point the app at their own server and photos live on object
// storage; local http is for the camera/printer bridges on this PC.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*",
  "media-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*",
  "font-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
  "worker-src 'self' blob:",
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const cspPlugin = {
  name: "studiodo-csp",
  apply: "build" as const,
  transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" as const }],
};

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react(), cspPlugin],
  base: "./",
  server: {
    port: 5173,
    // Vite blocks requests whose Host header it doesn't recognize (DNS
    // rebinding protection) — without this, a Cloudflare Tunnel (used to
    // expose this dev server over https for Xendit's webhook) gets a 403
    // from Vite itself before the request ever reaches the app.
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": "http://localhost:4050",
      "/storage": "http://localhost:4050",
    },
  },
  build: {
    outDir: path.resolve(__dirname, "..", "dist-client"),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
