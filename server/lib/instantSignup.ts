// Pure helpers for "daftar langsung" (instant sign-up): the platform setting that switches between instant accounts and the review queue,
// input validation, and the tenant slug. No database access here so it can be unit tested.

export type SignupMode = "application" | "instant";
export const normalizeSignupMode = (v: unknown): SignupMode => (v === "instant" ? "instant" : "application");

const BUSINESS_TYPES = new Set(["photobooth_rental", "event_organizer", "studio", "other"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type SignupInput = {
  businessName: string; ownerName: string; email: string; password: string;
  whatsapp: string | null; city: string | null; businessType: string | null; plan: string | null; wantsToPay: boolean;
};

export function validateSignup(body: Record<string, unknown>): { ok: true; value: SignupInput } | { ok: false; error: string } {
  const str = (k: string, max: number) => String(body[k] ?? "").trim().slice(0, max);
  const businessName = str("businessName", 100);
  const ownerName = str("ownerName", 100);
  const email = str("email", 200).toLowerCase();
  const password = String(body.password ?? "");
  if (businessName.length < 2) return { ok: false, error: "Nama bisnis minimal 2 karakter." };
  if (ownerName.length < 2) return { ok: false, error: "Nama pemilik minimal 2 karakter." };
  if (!EMAIL.test(email)) return { ok: false, error: "Format email tidak valid." };
  if (password.length < 8) return { ok: false, error: "Password minimal 8 karakter." };
  if (password.length > 100) return { ok: false, error: "Password terlalu panjang (maksimal 100 karakter)." };
  if (password.toLowerCase() === email || password.toLowerCase() === businessName.toLowerCase()) return { ok: false, error: "Password tidak boleh sama dengan email atau nama bisnis." };
  const whatsapp = str("whatsapp", 40).replace(/[^\d+]/g, "") || null;
  if (whatsapp && (whatsapp.replace(/\D/g, "").length < 9 || whatsapp.replace(/\D/g, "").length > 15)) return { ok: false, error: "Nomor WhatsApp tidak valid." };
  const type = str("businessType", 60);
  return {
    ok: true,
    value: {
      businessName, ownerName, email, password, whatsapp,
      city: str("city", 100) || null,
      businessType: BUSINESS_TYPES.has(type) ? type : null,
      plan: /^[a-z0-9-]{1,60}$/i.test(str("plan", 60)) ? str("plan", 60).toLowerCase() : null,
      wantsToPay: body.wantsToPay === true,
    },
  };
}

/** "Snap Corner Booth!" -> "snap-corner-booth"; the caller appends a random suffix when the slug is taken. */
export function slugify(name: string): string {
  const base = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return base || "booth";
}
