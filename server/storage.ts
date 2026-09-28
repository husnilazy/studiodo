import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

export function getExtension(filename: string, fallback: string) {
  const ext = path.extname(filename);
  return ext || fallback;
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

export async function saveUploadedFile(tenantId: string, file: UploadedFileInput, folder: string, fallbackExtension = ".jpg") {
  const safeFolder = cleanPrefix(folder);
  const filename = `${nanoid(12)}${getExtension(file.originalname, fallbackExtension)}`;
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
        ContentType: file.mimetype,
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
