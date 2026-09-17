/**
 * Google Drive storage adapter for STUDIODO Kiosk.
 * Uses a Service Account (JSON key) for server-to-server auth.
 * No user login required — set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_FOLDER_ID in .env
 */
import { google, drive_v3 } from "googleapis";
import { Readable } from "node:stream";

let _driveClient: drive_v3.Drive | null = null;

function getDriveClient(): drive_v3.Drive {
  if (_driveClient) return _driveClient;

  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON belum diset di .env");

  let credentials: object;
  try {
    credentials = JSON.parse(rawJson);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON yang valid");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  _driveClient = google.drive({ version: "v3", auth });
  return _driveClient;
}

export function resetDriveClient() {
  _driveClient = null;
}

export function isDriveConfigured(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_DRIVE_FOLDER_ID);
}

/** Buat folder baru di dalam parentFolderId, return folder ID */
export async function createDriveFolder(name: string, parentFolderId: string): Promise<string> {
  const drive = getDriveClient();
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
export async function uploadToDrive(options: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  folderId: string;
}): Promise<string> {
  const drive = getDriveClient();
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
export async function makePublic(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });
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
export async function uploadSessionPhoto(options: {
  sessionId: string;
  slotIndex: number;
  buffer: Buffer;
  mimeType: string;
  existingFolderId?: string | null;
}): Promise<{ fileId: string; folderId: string; viewUrl: string; downloadUrl: string; previewUrl: string }> {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;

  // Pakai folder yang sudah ada atau buat baru
  let folderId = options.existingFolderId;
  if (!folderId) {
    const today = new Date().toISOString().slice(0, 10);
    folderId = await createDriveFolder(`${today}-${options.sessionId.slice(0, 8)}`, rootFolderId);
    await makePublic(folderId);
  }

  const filename = `foto-${options.slotIndex + 1}.jpg`;
  const fileId = await uploadToDrive({
    buffer: options.buffer,
    filename,
    mimeType: options.mimeType || "image/jpeg",
    folderId,
  });
  await makePublic(fileId);

  return {
    fileId,
    folderId,
    viewUrl: getFileViewUrl(fileId),
    downloadUrl: getFileDownloadUrl(fileId),
    previewUrl: getFilePreviewUrl(fileId),
  };
}

/** Upload strip final ke Drive */
export async function uploadSessionStrip(options: {
  buffer: Buffer;
  folderId: string;
}): Promise<{ fileId: string; viewUrl: string; downloadUrl: string; previewUrl: string }> {
  const fileId = await uploadToDrive({
    buffer: options.buffer,
    filename: "strip-final.jpg",
    mimeType: "image/jpeg",
    folderId: options.folderId,
  });
  await makePublic(fileId);
  return {
    fileId,
    viewUrl: getFileViewUrl(fileId),
    downloadUrl: getFileDownloadUrl(fileId),
    previewUrl: getFilePreviewUrl(fileId),
  };
}

/** Upload media (video/gif) ke Drive */
export async function uploadSessionMedia(options: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  folderId: string;
}): Promise<{ fileId: string; viewUrl: string; downloadUrl: string }> {
  const fileId = await uploadToDrive(options);
  await makePublic(fileId);
  return {
    fileId,
    viewUrl: getFileViewUrl(fileId),
    downloadUrl: getFileDownloadUrl(fileId),
  };
}

/** Cek koneksi ke Drive (untuk admin status) */
export async function checkDriveConnection(): Promise<{ ok: boolean; email?: string; rootFolderName?: string; error?: string }> {
  try {
    const drive = getDriveClient();
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) return { ok: false, error: "GOOGLE_DRIVE_FOLDER_ID belum diset" };
    const folder = await drive.files.get({ fileId: folderId, fields: "name,id" });
    // Get service account email
    const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;
    const creds = JSON.parse(rawJson);
    return { ok: true, email: creds.client_email, rootFolderName: folder.data.name ?? undefined };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Gagal konek ke Google Drive" };
  }
}
