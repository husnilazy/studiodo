import crypto from "node:crypto";
import jwt from "jsonwebtoken";

// "Masuk dengan Google": verifying Google's ID token ourselves (no SDK) — signature against Google's published keys, audience =
// our client id, issuer, expiry, and a verified email. Used both for the web button (token handed over directly) and for the
// browser flow of the desktop app (code exchanged server-side). Configure GOOGLE_CLIENT_ID (+ GOOGLE_CLIENT_SECRET for the code flow).

const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const googleClientId = () => (process.env.GOOGLE_CLIENT_ID ?? "").trim();
export const googleClientSecret = () => (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
export const googleConfigured = () => Boolean(googleClientId());
export const googleCodeFlowConfigured = () => Boolean(googleClientId() && googleClientSecret());

type Jwk = { kid: string; kty: string; n: string; e: string };
let certCache: { at: number; keys: Jwk[] } | null = null;

async function signingKeys(fetchImpl: typeof fetch, force = false): Promise<Jwk[]> {
  if (!force && certCache && Date.now() - certCache.at < 3_600_000) return certCache.keys;
  const res = await fetchImpl(CERTS_URL);
  if (!res.ok) throw new Error(`Gagal mengambil kunci Google (${res.status})`);
  const body = (await res.json()) as { keys?: Jwk[] };
  certCache = { at: Date.now(), keys: body.keys ?? [] };
  return certCache.keys;
}

export type GoogleIdentity = { email: string; name: string | null; sub: string };
export type GoogleVerify = { ok: true; identity: GoogleIdentity } | { ok: false; error: string };

export async function verifyGoogleIdToken(idToken: string, opts: { clientId?: string; fetchImpl?: typeof fetch } = {}): Promise<GoogleVerify> {
  const clientId = opts.clientId ?? googleClientId();
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (!clientId) return { ok: false, error: "Login Google belum diaktifkan." };
  try {
    const header = jwt.decode(idToken, { complete: true })?.header;
    if (!header?.kid || header.alg !== "RS256") return { ok: false, error: "Token Google tidak valid." };
    let key = (await signingKeys(fetchImpl)).find((k) => k.kid === header.kid);
    if (!key) key = (await signingKeys(fetchImpl, true)).find((k) => k.kid === header.kid); // keys rotate
    if (!key) return { ok: false, error: "Token Google tidak dikenali." };
    const pem = crypto.createPublicKey({ key: key as unknown as crypto.JsonWebKey, format: "jwk" }).export({ type: "spki", format: "pem" }).toString();
    const claims = jwt.verify(idToken, pem, { algorithms: ["RS256"], audience: clientId }) as jwt.JwtPayload;
    if (!ISSUERS.includes(String(claims.iss))) return { ok: false, error: "Token Google tidak valid." };
    if (claims.email_verified !== true && claims.email_verified !== "true") return { ok: false, error: "Email Google ini belum terverifikasi." };
    const email = String(claims.email ?? "").trim().toLowerCase();
    if (!email) return { ok: false, error: "Akun Google tidak membawa email." };
    return { ok: true, identity: { email, name: typeof claims.name === "string" ? claims.name : null, sub: String(claims.sub) } };
  } catch (error) {
    const expired = error instanceof Error && error.name === "TokenExpiredError";
    return { ok: false, error: expired ? "Sesi Google kedaluwarsa, coba lagi." : "Token Google tidak valid." };
  }
}

export function googleAuthUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: googleClientId(), redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, prompt: "select_account", access_type: "online" });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Trades the one-time `code` from the redirect for an ID token (server-to-server, so the secret never reaches a browser). */
export async function exchangeGoogleCode(code: string, redirectUri: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; idToken: string } | { ok: false; error: string }> {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: googleClientId(), client_secret: googleClientSecret(), redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error_description?: string };
  if (!res.ok || !body.id_token) return { ok: false, error: body.error_description ?? "Google menolak permintaan masuk." };
  return { ok: true, idToken: body.id_token };
}

/** For tests. */
export function _resetGoogleCerts() { certCache = null; }
