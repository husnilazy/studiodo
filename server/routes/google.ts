import { Router } from "express";
import { checkDriveConnection, isDriveConfigured } from "../lib/gdrive.js";
import { getStorageDriver } from "../storage.js";

export const googleRouter = Router();

/** GET /api/google/status — cek status koneksi Google Drive */
googleRouter.get("/status", async (_req, res) => {
  const driver = getStorageDriver();
  if (driver !== "gdrive") {
    return res.json({ configured: false, driver, message: "Storage driver bukan gdrive" });
  }
  if (!isDriveConfigured()) {
    return res.json({ configured: false, driver, message: "GOOGLE_SERVICE_ACCOUNT_JSON atau GOOGLE_DRIVE_FOLDER_ID belum diset" });
  }
  const result = await checkDriveConnection();
  res.json({ configured: result.ok, driver, ...result });
});
