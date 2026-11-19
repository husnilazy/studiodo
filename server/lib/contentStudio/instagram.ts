import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Instagram Graph API content publishing (Instagram professional account linked to a Facebook Page).
// Flow per the official docs: create media container(s) -> wait until FINISHED -> media_publish.
//  * carousel: one container per item (is_carousel_item), then a CAROUSEL container that lists them
//  * reel: media_type=REELS with a public video_url (+ optional cover_url)
// Instagram downloads the media itself, so every URL must be publicly reachable (see publisher.ts).
// Images must be JPEG. Not exercised against a live account in this repo: see the Pengaturan tab's "Tes koneksi".

export type IgConnection = { userId: string; token: string; host: string; version: string };
export type Fetcher = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

const connFile = () => path.join(process.cwd(), "storage", "content-studio", "ig-connection.json");

/** Environment variables win over the file saved from the UI. */
export async function loadConnection(): Promise<IgConnection | null> {
  let userId = process.env.IG_USER_ID?.trim() ?? "";
  let token = process.env.IG_ACCESS_TOKEN?.trim() ?? "";
  if (!userId || !token) {
    try {
      const saved = JSON.parse(await readFile(connFile(), "utf8")) as { userId?: string; token?: string };
      userId = userId || saved.userId || "";
      token = token || saved.token || "";
    } catch { /* not saved yet */ }
  }
  if (!userId || !token) return null;
  return { userId, token, host: process.env.IG_GRAPH_HOST || "https://graph.facebook.com", version: process.env.IG_API_VERSION || "v21.0" };
}

export async function saveConnection(userId: string, token: string): Promise<void> {
  if (!/^\d{5,30}$/.test(userId)) throw new Error("ID akun Instagram harus berupa angka");
  if (token.length < 20) throw new Error("Access token terlalu pendek");
  await mkdir(path.dirname(connFile()), { recursive: true });
  await writeFile(connFile(), JSON.stringify({ userId, token }, null, 2));
}
export async function clearConnection(): Promise<void> {
  await mkdir(path.dirname(connFile()), { recursive: true });
  await writeFile(connFile(), "{}");
}

export const mask = (s: string) => (s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : "••••");

const defaultFetch: Fetcher = (url, init) => fetch(url, init) as any;

async function call(c: IgConnection, f: Fetcher, method: "GET" | "POST", p: string, params: Record<string, string | number | boolean | undefined> = {}) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, access_token: c.token })) if (v !== undefined) body.set(k, String(v));
  const base = `${c.host}/${c.version}/${p}`;
  const res = method === "GET" ? await f(`${base}?${body}`) : await f(base, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok || json?.error) {
    const e = json?.error;
    throw new Error(e ? `Instagram: ${e.message}${e.code ? ` (kode ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""})` : ""}` : `Instagram menjawab HTTP ${res.status}`);
  }
  return json;
}

export async function checkConnection(c: IgConnection, f: Fetcher = defaultFetch): Promise<{ username: string; mediaCount?: number }> {
  const j = await call(c, f, "GET", c.userId, { fields: "username,media_count" });
  return { username: String(j.username ?? ""), mediaCount: typeof j.media_count === "number" ? j.media_count : undefined };
}

export type IgCandidate = { igUserId: string; username: string; pageName: string; pageToken: string };

/**
 * Turns a short-lived user token (from the Graph API Explorer) into what auto-post needs: exchanges it for a long-lived user
 * token, lists the Facebook Pages it manages and keeps the ones with a linked Instagram professional account. The token used for
 * publishing is the PAGE token: a page token obtained from a long-lived user token does not expire. App id/secret are used for
 * the exchange only and are never stored or returned.
 */
export async function discoverAccounts(shortToken: string, app: { id: string; secret: string }, f: Fetcher = defaultFetch, host = "https://graph.facebook.com", version = "v21.0"): Promise<IgCandidate[]> {
  const get = async (p: string, params: Record<string, string>) => {
    const res = await f(`${host}/${version}/${p}?${new URLSearchParams(params)}`);
    let json: any = null;
    try { json = await res.json(); } catch { /* non-JSON body */ }
    if (!res.ok || json?.error) {
      const e = json?.error;
      throw new Error(e ? `Meta: ${e.message}${e.code ? ` (kode ${e.code})` : ""}` : `Meta menjawab HTTP ${res.status}`);
    }
    return json;
  };
  const long = await get("oauth/access_token", { grant_type: "fb_exchange_token", client_id: app.id, client_secret: app.secret, fb_exchange_token: shortToken });
  if (!long?.access_token) throw new Error("Meta tidak mengembalikan token jangka panjang");
  const pages = await get("me/accounts", { fields: "name,access_token,instagram_business_account{id,username}", limit: "50", access_token: String(long.access_token) });
  const out: IgCandidate[] = [];
  for (const pg of pages?.data ?? []) {
    const ig = pg?.instagram_business_account;
    if (ig?.id && pg?.access_token) out.push({ igUserId: String(ig.id), username: String(ig.username ?? ""), pageName: String(pg.name ?? ""), pageToken: String(pg.access_token) });
  }
  return out;
}

/** Caption + hashtags, trimmed to Instagram's limits (2200 characters, 30 hashtags). */
export function buildCaption(caption: string, hashtags: string[]): string {
  const tags = hashtags.slice(0, 30).join(" ");
  const full = tags ? `${caption.trim()}\n\n${tags}` : caption.trim();
  return full.length <= 2200 ? full : `${full.slice(0, 2199).trimEnd()}…`;
}

export type PublishInput = { type: "reel" | "images" | "videos"; urls: string[]; coverUrl?: string; caption: string };
export type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFinished(c: IgConnection, f: Fetcher, sleep: Sleep, id: string, maxMs: number, stepMs: number) {
  for (let waited = 0; waited <= maxMs; waited += stepMs) {
    const j = await call(c, f, "GET", id, { fields: "status_code,status" });
    if (j.status_code === "FINISHED") return;
    if (j.status_code === "ERROR" || j.status_code === "EXPIRED") throw new Error(`Instagram gagal memproses media (${j.status_code}${j.status ? `: ${j.status}` : ""})`);
    await sleep(stepMs);
  }
  throw new Error("Instagram belum selesai memproses media (timeout)");
}

export async function publishPost(c: IgConnection, input: PublishInput, f: Fetcher = defaultFetch, sleep: Sleep = realSleep, stepMs = 5000): Promise<{ id: string; permalink?: string }> {
  if (!input.urls.length) throw new Error("Tidak ada media untuk diposting");
  const caption = input.caption;
  let creation: string;
  if (input.type === "reel") {
    const r = await call(c, f, "POST", `${c.userId}/media`, { media_type: "REELS", video_url: input.urls[0], cover_url: input.coverUrl, caption, share_to_feed: true });
    creation = r.id;
    await waitFinished(c, f, sleep, creation, 10 * 60_000, stepMs);
  } else if (input.urls.length === 1 && input.type === "images") {
    creation = (await call(c, f, "POST", `${c.userId}/media`, { image_url: input.urls[0], caption })).id;
    await waitFinished(c, f, sleep, creation, 2 * 60_000, stepMs);
  } else {
    if (input.urls.length < 2 || input.urls.length > 10) throw new Error("Carousel Instagram harus berisi 2 sampai 10 slide");
    const children: string[] = [];
    for (const url of input.urls) {
      const r = await call(c, f, "POST", `${c.userId}/media`, input.type === "videos"
        ? { media_type: "VIDEO", video_url: url, is_carousel_item: true }
        : { image_url: url, is_carousel_item: true });
      children.push(r.id);
    }
    for (const id of children) await waitFinished(c, f, sleep, id, input.type === "videos" ? 10 * 60_000 : 2 * 60_000, stepMs);
    creation = (await call(c, f, "POST", `${c.userId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption })).id;
    await waitFinished(c, f, sleep, creation, 2 * 60_000, stepMs);
  }
  const pub = await call(c, f, "POST", `${c.userId}/media_publish`, { creation_id: creation });
  let permalink: string | undefined;
  try { permalink = (await call(c, f, "GET", pub.id, { fields: "permalink" })).permalink; } catch { /* published; link is a bonus */ }
  return { id: String(pub.id), permalink };
}
