import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { packagesRouter } from "./routes/packages.js";
import { sessionsRouter } from "./routes/sessions.js";
import { paymentRouter } from "./routes/payment.js";
import { framesRouter } from "./routes/frames.js";
import { configRouter } from "./routes/config.js";
import { screenLayoutsRouter } from "./routes/screenLayouts.js";
import { vouchersRouter } from "./routes/vouchers.js";
import { googleRouter } from "./routes/google.js";
import { authRouter } from "./routes/auth.js";
import { kioskKeysRouter } from "./routes/kioskKeys.js";
import { superadminRouter } from "./routes/superadmin.js";
import { tenantApplicationsRouter } from "./routes/tenantApplications.js";
import { publicPlansRouter } from "./routes/publicPlans.js";
import { publicContentRouter } from "./routes/siteContent.js";
import { portalRouter, billingWebhookRouter } from "./routes/portal.js";
import { publicBlogRouter } from "./routes/blog.js";
import { publicMarketplaceRouter, marketplaceTenantRouter } from "./routes/marketplace.js";
import { publicCreatorsRouter } from "./routes/creators.js";
import { publicDirectoryRouter, directoryTenantRouter } from "./routes/directory.js";
import { publicAssetsRouter } from "./routes/siteAssets.js";
import { creatorPortalRouter } from "./routes/creatorPortal.js";
import { client } from "./db/client.js";
import { logEvent } from "./lib/platformEvents.js";

// Without these, an error thrown outside an Express route handler (e.g. the
// postgres driver's internal reconnect logic hitting a dead socket when
// Neon's serverless compute auto-suspends mid-request) is an *uncaught*
// exception — Node's default behavior is to crash the whole process on
// that, which pm2 then restarts. That crash-loop is what was silently
// killing every in-flight kiosk request each time (confirmed live: 100+
// pm2 restarts from ECONNRESET/CONNECT_TIMEOUT to Neon), even though the
// server "looks" like it's running again seconds later.
process.on("uncaughtException", (error) => {
  console.error("[STUDIODO] uncaughtException:", error);
});
process.on("unhandledRejection", (reason) => {
  console.error("[STUDIODO] unhandledRejection:", reason);
});

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const clientDist = path.resolve(dirname(fileURLToPath(import.meta.url)), "../dist-client");

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use("/storage", express.static(path.join(process.cwd(), "storage")));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "studiodo-server" }));

app.use("/api/packages", packagesRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/frames", framesRouter);
app.use("/api/config", configRouter);
app.use("/api/config", screenLayoutsRouter);
app.use("/api/vouchers", vouchersRouter);
app.use("/api/google", googleRouter);
app.use("/api/auth", authRouter);
app.use("/api/kiosk-keys", kioskKeysRouter);
app.use("/api/superadmin", superadminRouter);
app.use("/api/tenant-applications", tenantApplicationsRouter);
app.use("/api/public", publicPlansRouter);
app.use("/api/public", publicContentRouter);
app.use("/api/public", publicBlogRouter);
app.use("/api/public", publicMarketplaceRouter);
app.use("/api/public", publicCreatorsRouter);
app.use("/api/public", publicDirectoryRouter);
app.use("/api/public", publicAssetsRouter);
app.use("/api/creator", creatorPortalRouter);
app.use("/api/portal/directory", directoryTenantRouter);
app.use("/api/portal/marketplace", marketplaceTenantRouter);
app.use("/api/portal", portalRouter);
app.use("/api/billing", billingWebhookRouter);

// The Electron kiosk loads its own bundled client locally (file://) and
// never hits this — but the customer-facing public gallery page
// (ShareGallery, opened by scanning the QR code on the Hasil screen) is a
// genuine public web page that needs to be served from somewhere reachable
// over HTTP, so this server also serves the built client for that case.
app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.method === "GET" && req.accepts("html")) {
    res.sendFile(path.join(clientDist, "index.html"), (error) => {
      if (error) next(error);
    });
    return;
  }
  next();
});

// Global error handler — tanpa ini, error di route (mis. query DB gagal)
// cuma nongol sebagai "500" polos di browser tanpa pesan yang berguna.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(`[STUDIODO] Error di ${req.method} ${req.path}:`, err?.message || err);
  // Surface unhandled route errors in the superadmin's Activity & Error log
  // too — previously the only trace of a server-side bug was this console
  // line, invisible unless someone was watching the terminal at the moment
  // it happened.
  logEvent({
    tenantId: (req as any).tenantId ?? null,
    level: "error",
    category: "system",
    action: "server.unhandled_error",
    message: `${req.method} ${req.path}: ${err?.message ?? "Terjadi kesalahan di server"}`,
    actorType: "system",
    metadata: { status: err?.status ?? 500, code: err?.code },
  });
  if (err?.code === "42P01") {
    console.error("[STUDIODO] Tabel database belum ada. Jalankan: npm run db:push");
  }
  if (err?.code === "ECONNREFUSED") {
    console.error("[STUDIODO] Tidak bisa konek ke database Postgres. Pastikan DATABASE_URL benar dan Postgres bisa dijangkau.");
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: "Ukuran file terlalu besar untuk disimpan. Gunakan gambar dengan resolusi lebih kecil." });
    return;
  }
  res.status(err?.status ?? 500).json({ error: err?.message ?? "Terjadi kesalahan di server" });
});

async function checkDatabase() {
  try {
    await client`SELECT 1`;
    console.log("[STUDIODO] Koneksi database OK");
  } catch (error: any) {
    console.error("[STUDIODO] ⚠️  Gagal konek ke database:", error?.message ?? error);
    console.error("[STUDIODO] Server tetap jalan, tapi endpoint /api/* akan mengembalikan error 500 sampai database siap.");
  }
}

// Neon's serverless compute auto-suspends after a few minutes idle; the next
// query then pays a multi-second cold-start (measured ~6s) before it
// responds — that's what makes a customer's gallery QR feel slow or, if the
// idle stretch was long enough, time out into an outright error. A periodic
// no-op query keeps compute from ever suspending. Set KEEP_DB_WARM=false to
// disable — this does spend more Neon compute-hours than letting it suspend
// during genuinely idle periods, so it can push a free-tier project over its
// monthly compute-hour allowance faster.
function startKeepDbWarm() {
  if (process.env.KEEP_DB_WARM === "false") return;
  const intervalMs = Number(process.env.KEEP_DB_WARM_INTERVAL_MS) || 4 * 60 * 1000;
  setInterval(() => {
    client`SELECT 1`.catch((error: any) => console.error("[STUDIODO] keep-alive ping gagal:", error?.message ?? error));
  }, intervalMs);
}

app.listen(PORT, () => {
  console.log(`[STUDIODO] server jalan di http://localhost:${PORT}`);
  checkDatabase();
  startKeepDbWarm();
});
