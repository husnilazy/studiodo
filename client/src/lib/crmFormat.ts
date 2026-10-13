// Small formatting helpers shared by the CRM and live-monitor panels.

export const rupiah = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

/** Compact money for narrow summary tiles: "Rp 1,63 jt". Full amounts stay in lists and tooltips. */
export const rupiahShort = (value: number) =>
  value >= 1_000_000_000 ? `Rp ${(value / 1_000_000_000).toFixed(2).replace(".", ",")} M` : value >= 1_000_000 ? `Rp ${(value / 1_000_000).toFixed(2).replace(".", ",")} jt` : rupiah(value);

/** "baru saja", "5 menit lalu", "3 jam lalu", "kemarin", "12 Okt". */
export function relativeTime(value: string | Date | null | undefined, now = Date.now()): string {
  if (!value) return "belum pernah";
  const t = new Date(value).getTime();
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "kemarin";
  if (days < 7) return `${days} hari lalu`;
  return new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: days > 300 ? "numeric" : undefined });
}

export function duration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m >= 60 ? `${Math.floor(m / 60)} j ${m % 60} m` : `${m}:${String(s).padStart(2, "0")}`;
}

export const initialsOf = (name: string | null, fallback: string) => {
  const source = (name ?? "").trim() || fallback;
  const parts = source.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

/** International digits → "+62 812-3456-7890" for display. */
export function prettyPhone(digits: string | null): string {
  if (!digits) return "";
  if (digits.startsWith("62")) {
    const rest = digits.slice(2);
    return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7)}`.replace(/-$/, "");
  }
  return `+${digits}`;
}

export const waHref = (digits: string, text?: string) => `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

export const DEFAULT_WA_TEMPLATE = "Halo {nama}, terima kasih sudah berfoto di {brand}! 📸 Ini hasil foto kamu: {link}";

export function fillTemplate(template: string, vars: { nama?: string | null; brand?: string | null; link?: string | null }): string {
  return template
    .replaceAll("{nama}", vars.nama?.trim() || "kak")
    .replaceAll("{brand}", vars.brand?.trim() || "kami")
    .replaceAll("{link}", vars.link?.trim() || "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** RFC-4180 CSV with a UTF-8 BOM so Excel opens Indonesian text and emoji correctly. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const text = v === null || v === undefined ? "" : String(v);
    // Spreadsheet formulas from customer-typed data (names, feedback) must stay text.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return `﻿${rows.map((r) => r.map(cell).join(",")).join("\r\n")}`;
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
