import type { Response } from "express";
import multer from "multer";
import { saveUploadedFile } from "../storage.js";
import { getStorageSettings } from "./storageConfig.js";

// Screenshots for the Bantuan chat. Only real images are accepted (checked by their first bytes, not by the name or MIME type the
// client claims), they are stored under the tenant's own folder, and a message may only reference files stored this way — never an
// arbitrary URL — so the chat cannot be used to show or host anything else.

export const MAX_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // also stays under Vercel's 4.5 MB request limit

export const supportImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });

export function detectImageExtension(buf: Buffer): "jpg" | "png" | "gif" | "webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("latin1") === "GIF8") return "gif";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

/** Validates and stores one uploaded screenshot for `tenantId`; returns what the client then attaches to a message. */
export async function storeSupportImage(tenantId: string, file: { buffer: Buffer; originalname: string } | undefined): Promise<{ ok: true; url: string; name: string } | { ok: false; error: string }> {
  if (!file) return { ok: false, error: "Pilih gambar terlebih dahulu." };
  const ext = detectImageExtension(file.buffer);
  if (!ext) return { ok: false, error: "File harus berupa gambar (PNG, JPG, WebP, atau GIF)." };
  const url = await saveUploadedFile(tenantId, { buffer: file.buffer, originalname: `bantuan.${ext}`, mimetype: MIME[ext] }, "support", `.${ext}`);
  const name = file.originalname.replace(/[^\w.\- ]+/g, "").slice(0, 80) || `gambar.${ext}`;
  return { ok: true, url, name };
}

/**
 * Attachments sent by a client: at most MAX_ATTACHMENTS, each a file previously stored by storeSupportImage for this tenant. The URL
 * must start with this deployment's own storage address (local /storage or the R2 public base URL), so it can never point at another site.
 */
export async function cleanAttachments(tenantId: string, raw: unknown): Promise<{ url: string; name: string }[] | null> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ATTACHMENTS) return null;
  const settings = await getStorageSettings(tenantId);
  const prefixes = ["/storage"];
  if (settings.driver === "r2" && settings.r2PublicBaseUrl) prefixes.push(String(settings.r2PublicBaseUrl).replace(/\/$/, ""));
  const tail = new RegExp("^/(?:[A-Za-z0-9_./-]+/)?" + tenantId + "/support/[A-Za-z0-9_-]{12}" + String.raw`\.` + "(jpg|png|gif|webp)$");
  const out: { url: string; name: string }[] = [];
  for (const item of raw) {
    const url = typeof item?.url === "string" ? item.url : "";
    const prefix = prefixes.find((p) => url.startsWith(`${p}/`));
    if (!prefix || !tail.test(url.slice(prefix.length))) return null;
    out.push({ url, name: String(item?.name ?? "gambar").replace(/[^\w.\- ]+/g, "").slice(0, 80) || "gambar" });
  }
  return out;
}

// --- CSV (opened in Excel by staff): tenant-written text must never start a formula --------------------------------------------------
const csvCell = (value: unknown) => {
  let text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
export function sendCsv(res: Response, name: string, header: string[], rows: unknown[][]) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send("﻿" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n"));
}
