import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import { getStorageSettings, type StorageDriver, type StorageSettings } from "./lib/storageConfig.js";

export type { StorageDriver };

export interface UploadedFileInput {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
}

const localStorageRoot = path.join(process.cwd(), "storage");

// Keyed by tenantId, same reasoning as storageConfig.ts's settings cache.
const r2Clients = new Map<string, S3Client>();

export function resetR2Client(tenantId: string) {
  r2Clients.delete(tenantId);
}

export async function getStorageDriver(tenantId: string): Promise<StorageDriver> {
  return (await getStorageSettings(tenantId)).driver;
}

export function cleanPrefix(value?: string | null) {
  return String(value ?? "").replace(/^\/+|\/+$/g, "");
}

// Only these file types are ever stored, whatever name or MIME type the client claims. Anything else (.html, .svg, .js …) is stored under
// the caller's fallback extension and served as that type, so an uploaded web page or SVG can never run as a page of this site.
const SAFE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
};

export function getExtension(filename: string, fallback: string) {
  const ext = path.extname(filename).toLowerCase();
  if (ext in SAFE_TYPES) return ext;
  const safeFallback = fallback.toLowerCase();
  return safeFallback in SAFE_TYPES ? safeFallback : ".jpg";
}

function buildR2Client(tenantId: string, settings: StorageSettings) {
  const existing = r2Clients.get(tenantId);
  if (existing) return existing;

  const endpoint = settings.r2Endpoint ?? (settings.r2AccountId ? `https://${settings.r2AccountId}.r2.cloudflarestorage.com` : undefined);

  if (!endpoint || !settings.r2AccessKeyId || !settings.r2SecretAccessKey || !settings.r2Bucket || !settings.r2PublicBaseUrl) {
    throw new Error(
      "Konfigurasi R2 belum lengkap. Isi R2 Account ID/Endpoint, Bucket, Access Key ID, Secret Access Key, dan Public Base URL lewat Admin → Storage.",
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: settings.r2AccessKeyId, secretAccessKey: settings.r2SecretAccessKey },
  });
  r2Clients.set(tenantId, client);
  return client;
}

// Active-content types are refused outright (with a message the tenant can act on) instead of being silently stored under a wrong name.
const ACTIVE_CONTENT = /svg|html|xml|javascript|ecmascript|^text\//i;

export async function saveUploadedFile(tenantId: string, file: UploadedFileInput, folder: string, fallbackExtension = ".jpg") {
  if (file.mimetype && ACTIVE_CONTENT.test(file.mimetype.split(";")[0].trim())) {
    throw new Error("Format file tidak didukung. Gunakan PNG, JPG, WebP, GIF, MP4, atau WebM (SVG dan HTML tidak diizinkan).");
  }
  const safeFolder = cleanPrefix(folder);
  const extension = getExtension(file.originalname, fallbackExtension);
  const filename = `${nanoid(12)}${extension}`;
  const settings = await getStorageSettings(tenantId);

  if (settings.driver === "r2") {
    const rawPrefix = cleanPrefix(settings.r2Prefix);
    // tenantId is always included, even though most tenants have their own
    // dedicated bucket — it's what keeps files apart for tenants that fall
    // back to a shared bucket (no R2 config of their own yet).
    const keyParts = [rawPrefix, tenantId, safeFolder, filename].filter(Boolean);
    const key = keyParts.join("/");

    await buildR2Client(tenantId, settings).send(
      new PutObjectCommand({
        Bucket: settings.r2Bucket!,
        Key: key,
        Body: file.buffer,
        ContentType: SAFE_TYPES[extension], // from the validated extension, never the client's claimed MIME type
      }),
    );
    const baseUrl = String(settings.r2PublicBaseUrl).replace(/\/$/, "");
    return `${baseUrl}/${key}`;
  }

  const localDir = path.join(localStorageRoot, tenantId, safeFolder);
  await fs.mkdir(localDir, { recursive: true });
  await fs.writeFile(path.join(localDir, filename), file.buffer);
  return `/storage/${tenantId}/${safeFolder}/${filename}`;
}

export interface PresignedUpload {
  uploadUrl: string;
  /** Final public URL of the file once the PUT succeeds (the same shape saveUploadedFile returns). */
  url: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
}

const PRESIGN_TTL_SECONDS = 300;

/**
 * A short-lived URL the browser PUTs a file to directly (so the bytes never pass through this server — Vercel rejects request
 * bodies over 4.5 MB). Content type and exact length are part of the signature, so the URL cannot be reused for something else.
 * Returns null when the tenant's storage is not R2: the caller then falls back to sending the file through the API.
 */
export async function createPresignedUpload(tenantId: string, folder: string, file: { contentType: string; size: number; extension: string }): Promise<PresignedUpload | null> {
  const settings = await getStorageSettings(tenantId);
  if (settings.driver !== "r2") return null;
  const key = [cleanPrefix(settings.r2Prefix), tenantId, cleanPrefix(folder), `${nanoid(12)}${file.extension}`].filter(Boolean).join("/");
  const uploadUrl = await getSignedUrl(
    buildR2Client(tenantId, settings),
    new PutObjectCommand({ Bucket: settings.r2Bucket!, Key: key, ContentType: file.contentType, ContentLength: file.size }),
    { expiresIn: PRESIGN_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) },
  );
  return {
    uploadUrl,
    url: `${String(settings.r2PublicBaseUrl).replace(/\/$/, "")}/${key}`,
    headers: { "Content-Type": file.contentType },
    expiresInSeconds: PRESIGN_TTL_SECONDS,
  };
}
