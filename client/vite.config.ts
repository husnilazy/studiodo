import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
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
