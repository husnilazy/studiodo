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

app.listen(PORT, () => {
  console.log(`[STUDIODO] server jalan di http://localhost:${PORT}`);
});
