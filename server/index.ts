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
import { vouchersRouter } from "./routes/vouchers.js";
import { googleRouter } from "./routes/google.js";
import { client } from "./db/client.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const clientDist = path.resolve(dirname(fileURLToPath(import.meta.url)), "../dist-client");

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use("/storage", express.static(path.join(process.cwd(), "storage")));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "studiodo-server" }));

app.use("/api/packages", packagesRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/frames", framesRouter);
app.use("/api/config", configRouter);
app.use("/api/vouchers", vouchersRouter);
app.use("/api/google", googleRouter);

// In the Windows package the same server hosts the compiled kiosk UI.
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
  if (err?.code === "42P01") {
    console.error("[STUDIODO] Tabel database belum ada. Jalankan: npm run db:push");
  }
  if (err?.code === "ECONNREFUSED") {
    console.error("[STUDIODO] Tidak bisa konek ke PostgreSQL. Pastikan sudah jalan: docker compose up -d");
  }
  res.status(err?.status ?? 500).json({ error: err?.message ?? "Terjadi kesalahan di server" });
});

async function checkDatabase() {
  try {
    await client`select 1`;
    console.log("[STUDIODO] Koneksi database OK");
  } catch (error: any) {
    console.error("[STUDIODO] ⚠️  Gagal konek ke database:", error?.message ?? error);
    if (error?.code === "ECONNREFUSED") {
      console.error("[STUDIODO] → Postgres belum jalan. Jalankan: docker compose up -d");
    } else if (error?.code === "42P01" || /relation .* does not exist/i.test(String(error?.message))) {
      console.error("[STUDIODO] → Tabel belum dibuat. Jalankan: npm run db:push");
    }
    console.error("[STUDIODO] Server tetap jalan, tapi endpoint /api/* akan mengembalikan error 500 sampai database siap.");
  }
}

app.listen(PORT, () => {
  console.log(`[STUDIODO] server jalan di http://localhost:${PORT}`);
  checkDatabase();
});
