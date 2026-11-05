import type { BoothConfig } from "./boothConfigStore";

export type SocialKey = "instagram" | "tiktok" | "facebook" | "youtube" | "whatsapp" | "website";
export interface SocialItem { key: SocialKey; label: string; handle: string; url: string }

/** "https://instagram.com/studiodo/" -> "@studiodo"; a plain "studiodo" or "@studiodo" is kept as a handle. */
function handleOf(raw: string, key: SocialKey): string {
  const value = raw.trim();
  if (!value) return "";
  if (key === "whatsapp") {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    return `+${digits.startsWith("0") ? `62${digits.slice(1)}` : digits}`;
  }
  if (!/^https?:\/\//i.test(value)) return key === "website" ? value.replace(/^www\./i, "") : value.startsWith("@") ? value : `@${value.replace(/^\/+/, "")}`;
  try {
    const url = new URL(value);
    if (key === "website") return url.host.replace(/^www\./i, "") + (url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : "");
    const first = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!first) return url.host.replace(/^www\./i, "");
    return first.startsWith("@") ? first : `@${first}`;
  } catch {
    return value;
  }
}

/** A tappable link from whatever the tenant typed: a full link is kept, a bare handle is expanded per platform. */
export function socialUrl(raw: string, key: SocialKey): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const bare = value.replace(/^@/, "").replace(/^\/+/, "");
  switch (key) {
    case "instagram": return `https://instagram.com/${bare}`;
    case "tiktok": return `https://tiktok.com/@${bare}`;
    case "facebook": return `https://facebook.com/${bare}`;
    case "youtube": return `https://youtube.com/@${bare}`;
    case "whatsapp": { const d = value.replace(/\D/g, ""); return d ? `https://wa.me/${d.startsWith("0") ? `62${d.slice(1)}` : d}` : ""; }
    default: return `https://${bare.replace(/^www\./i, "www.")}`;
  }
}

/** The social/contact lines the tenant filled in, in a fixed order, as short display handles. */
export function socialItems(config: Pick<BoothConfig, "socialInstagram" | "socialTiktok" | "socialFacebook" | "socialYoutube" | "contactWhatsapp" | "websiteUrl">): SocialItem[] {
  const rows: [SocialKey, string, string][] = [
    ["instagram", "Instagram", config.socialInstagram ?? ""],
    ["tiktok", "TikTok", config.socialTiktok ?? ""],
    ["facebook", "Facebook", config.socialFacebook ?? ""],
    ["youtube", "YouTube", config.socialYoutube ?? ""],
    ["whatsapp", "WhatsApp", config.contactWhatsapp ?? ""],
    ["website", "Website", config.websiteUrl ?? ""],
  ];
  return rows
    .map(([key, label, raw]) => ({ key, label, handle: handleOf(raw, key), url: socialUrl(raw, key) }))
    .filter((item) => item.handle !== "" && item.url !== "");
}
