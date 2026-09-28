import { Router } from "express";
import { checkDriveConnection, isDriveConfigured } from "../lib/gdrive.js";
import { getStorageDriver } from "../storage.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";

export const googleRouter = Router();

/** GET /api/google/status — cek status koneksi Google Drive (admin) */
googleRouter.get("/status", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const driver = await getStorageDriver(tenantId);
  if (driver !== "gdrive") {
    return res.json({ configured: false, driver, message: "Storage driver bukan gdrive" });
  }
  if (!(await isDriveConfigured(tenantId))) {
    return res.json({ configured: false, driver, message: "Kredensial Google Drive belum diatur (Admin → Storage)" });
  }
  const result = await checkDriveConnection(tenantId);
  res.json({ configured: result.ok, driver, ...result });
});
