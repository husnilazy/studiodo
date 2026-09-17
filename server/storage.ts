import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";

export type StorageDriver = "local" | "r2" | "gdrive";

export interface UploadedFileInput {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
}

const localStorageRoot = path.join(process.cwd(), "storage");

let r2Client: S3Client | null = null;

export function resetR2Client() {
  r2Client = null;
}

export function getStorageDriver(): StorageDriver {
  const d = process.env.STORAGE_DRIVER;
  if (d === "r2") return "r2";
  if (d === "gdrive") return "gdrive";
  return "local";
}

export function cleanPrefix(value?: string) {
  return String(value ?? "").replace(/^\/+|\/+$/g, "");
}

export function getExtension(filename: string, fallback: string) {
  const ext = path.extname(filename);
  return ext || fallback;
}

export function getR2Client() {
  if (r2Client) return r2Client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const endpoint = process.env.R2_ENDPOINT ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey || !process.env.R2_BUCKET || !process.env.R2_PUBLIC_BASE_URL) {
    throw new Error(
      "Konfigurasi R2 belum lengkap. Isi R2_ACCOUNT_ID/R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_PUBLIC_BASE_URL.",
    );
  }

  r2Client = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return r2Client;
}

export async function saveUploadedFile(file: UploadedFileInput, folder: string, fallbackExtension = ".jpg") {
  const safeFolder = cleanPrefix(folder);
  const filename = `${nanoid(12)}${getExtension(file.originalname, fallbackExtension)}`;
  const driver = getStorageDriver();

  if (driver === "r2") {
    const rawPrefix = cleanPrefix(process.env.R2_PREFIX);
    const keyParts = [rawPrefix, safeFolder, filename].filter(Boolean);
    const key = keyParts.join("/");

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    const baseUrl = String(process.env.R2_PUBLIC_BASE_URL).replace(/\/$/, "");
    return `${baseUrl}/${key}`;
  }

  const localDir = path.join(localStorageRoot, safeFolder);
  await fs.mkdir(localDir, { recursive: true });
  await fs.writeFile(path.join(localDir, filename), file.buffer);
  return `/storage/${safeFolder}/${filename}`;
}
