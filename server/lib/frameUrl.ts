// Frame images are stored either as absolute URLs (R2 / Google Drive) or as paths relative to this
// server (local storage driver). Anything that hands a frame URL to another origin — the kiosk, the
// marketing website, another tenant — needs the absolute form.
export function resolveFrameUrl(value: unknown): string {
  const url = String(value ?? "");
  if (!url || /^(?:data:|https?:|blob:|file:)/i.test(url)) return url;
  const baseUrl = String(process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/${url.replace(/^\/+/, "")}` : url;
}
