/**
 * Google Drive storage adapter for STUDIODO Kiosk.
 * Uses a Service Account (JSON key) for server-to-server auth.
 * No user login required — set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_FOLDER_ID in .env
 */
import { google, drive_v3 } from "googleapis";
import { Readable } from "node:stream";
import { getStorageSettings } from "./storageConfig.js";

// Keyed by tenantId, same reasoning as storageConfig.ts's settings cache.
const driveClients = new Map<string, { client: drive_v3.Drive; jsonHash: string }>();

async function getDriveClient(tenantId: string): Promise<drive_v3.Drive> {
  const settings = await getStorageSettings(tenantId);
  const rawJson = settings.gdriveServiceAccountJson;
  if (!rawJson) throw new Error("Kredensial Google Drive belum diatur (Admin → Storage)");

  // Rebuild the client if the stored credential changed (e.g. admin rotated it).
  const existing = driveClients.get(tenantId);
  if (existing && existing.jsonHash === rawJson) return existing.client;

  let credentials: object;
  try {
    credentials = JSON.parse(rawJson);
  } catch {
    throw new Error("Kredensial Google Drive bukan JSON yang valid");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  const client = google.drive({ version: "v3", auth });
  driveClients.set(tenantId, { client, jsonHash: rawJson });
  return client;
}

export function resetDriveClient(tenantId: string) {
  driveClients.delete(tenantId);
}

export async function isDriveConfigured(tenantId: string): Promise<boolean> {
  const settings = await getStorageSettings(tenantId);
  return !!(settings.gdriveServiceAccountJson && settings.gdriveFolderId);
}

/** Buat folder baru di dalam parentFolderId, return folder ID */
export async function createDriveFolder(tenantId: string, name: string, parentFolderId: string): Promise<string> {
  const drive = await getDriveClient(tenantId);
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
  });
  const id = res.data.id;
  if (!id) throw new Error("Drive gagal membuat folder — response tanpa id");
  return id;
}

/** Upload file ke folderId, return file ID */
export async function uploadToDrive(tenantId: string, options: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  folderId: string;
}): Promise<string> {
  const drive = await getDriveClient(tenantId);
  const stream = Readable.from(options.buffer);
  const res = await drive.files.create({
    requestBody: {
      name: options.filename,
      parents: [options.folderId],
    },
    media: {
      mimeType: options.mimeType,
      body: stream,
    },
    fields: "id",
  });
  const id = res.data.id;
  if (!id) throw new Error("Drive gagal upload file — response tanpa id");
  return id;
}

/** Set file/folder menjadi public (anyone can view) */
export async function makePublic(tenantId: string, fileId: string): Promise<void> {
  const drive = await getDriveClient(tenantId);
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });
  } catch (error: any) {
    const status = error?.code ?? error?.response?.status;
    // Shared drives or restricted Workspace domains may reject public sharing
    // even though the file upload itself succeeded.
    if (status === 403) {
      console.warn(`[gdrive] File ${fileId} tersimpan, tetapi akses publik gagal (403).`);
      return;
    }
    throw error;
  }
}

/** Return shareable view URL untuk file */
export function getFileViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/** Return direct download URL */
export function getFileDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/** Return folder view URL */
export function getFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/** Return embedded preview URL (untuk gambar di iframe) */
export function getFilePreviewUrl(fileId: string): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
}

/**
 * Upload foto sesi ke Drive.
 * Buat folder sesi jika belum ada.
 */
export async function uploadSessionPhoto(tenantId: string, options: {
  sessionId: string;
  slotIndex: number;
  buffer: Buffer;
  mimeType: string;
  existingFolderId?: string | null;
}): Promise<{ fileId: string; folderId: string; viewUrl: string; downloadUrl: string; previewUrl: string }> {
  const settings = await getStorageSettings(tenantId);
  const rootFolderId = settings.gdriveFolderId;
  if (!rootFolderId) throw new Error("Google Drive Folder ID belum diatur (Admin → Storage)");

  // Pakai folder yang sudah ada atau buat baru
  let folderId = options.existingFolderId;
  if (!folderId) {
    const today = new Date().toISOString().slice(0, 10);
    folderId = await createDriveFolder(tenantId, `${today}-${options.sessionId.slice(0, 8)}`, rootFolderId);
    await makePublic(tenantId, folderId);
  }

  const filename = `foto-${options.slotIndex + 1}.jpg`;
  const fileId = await uploadToDrive(tenantId, {
    buffer: options.buffer,
    filename,
    mimeType: options.mimeType || "image/jpeg",
    folderId,
  });
  await makePublic(tenantId, fileId);

  return {
    fileId,
    folderId,
    viewUrl: getFileViewUrl(fileId),
    downloadUrl: getFileDownloadUrl(fileId),
    previewUrl: getFilePreviewUrl(fileId),
  };
}

/** Upload strip final ke Drive */
export async function uploadSessionStrip(tenantId: string, options: {
  buffer: Buffer;
  folderId: string;
}): Promise<{ fileId: string; viewUrl: string; downloadUrl: string; previewUrl: string }> {
  const fileId = await uploadToDrive(tenantId, {
    buffer: options.buffer,
    filename: "strip-final.jpg",
    mimeType: "image/jpeg",
    folderId: options.folderId,
  });
  await makePublic(tenantId, fileId);
  return {
    fileId,
    viewUrl: getFileViewUrl(fileId),
    downloadUrl: getFileDownloadUrl(fileId),
    previewUrl: getFilePreviewUrl(fileId),
  };
}

/** Upload media (video/gif) ke Drive */
export async function uploadSessionMedia(tenantId: string, options: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  folderId: string;
}): Promise<{ fileId: string; viewUrl: string; downloadUrl: string }> {
  const fileId = await uploadToDrive(tenantId, options);
  await makePublic(tenantId, fileId);
  return {
    fileId,
    viewUrl: getFileViewUrl(fileId),
    downloadUrl: getFileDownloadUrl(fileId),
  };
}

/** Cek koneksi ke Drive (untuk admin status) */
export async function checkDriveConnection(tenantId: string): Promise<{ ok: boolean; email?: string; rootFolderName?: string; error?: string }> {
  try {
    const settings = await getStorageSettings(tenantId);
    const folderId = settings.gdriveFolderId;
    if (!folderId) return { ok: false, error: "Google Drive Folder ID belum diset" };
    const drive = await getDriveClient(tenantId);
    const folder = await drive.files.get({ fileId: folderId, fields: "name,id" });
    // Get service account email
    const creds = JSON.parse(settings.gdriveServiceAccountJson!);
    return { ok: true, email: creds.client_email, rootFolderName: folder.data.name ?? undefined };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Gagal konek ke Google Drive" };
  }
}
