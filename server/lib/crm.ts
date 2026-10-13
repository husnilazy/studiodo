import { sql, type SQL } from "drizzle-orm";
import { sessions } from "../db/schema.js";

// CRM: a customer is whoever left a WhatsApp number or email on a session. The same person returns many times, so
// sessions are grouped into one customer by a "contact key": the WhatsApp number in international form (62…), else the
// email. The JS and SQL versions below MUST agree — the SQL one groups, the JS one builds links and validates input.

/** "0812-3456-789", "+62 812 3456 789", "62812…" and "812…" are all the same Indonesian number → "62812…". Null if it isn't a plausible number. */
export function normalizeWhatsapp(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  let intl = digits;
  if (digits.startsWith("0")) intl = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) intl = `62${digits}`;
  // A number from another country already starts with its own code; only the plausible length range is checked.
  return intl.length >= 9 && intl.length <= 15 ? intl : null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function contactKeyOf(whatsapp: string | null | undefined, email: string | null | undefined): string | null {
  const wa = normalizeWhatsapp(whatsapp);
  if (wa) return `wa:${wa}`;
  const em = normalizeEmail(email);
  return em ? `em:${em}` : null;
}

export const isContactKey = (value: string) => /^(wa:\d{9,15}|em:[^\s@]+@[^\s@]+\.[^\s@]+)$/.test(value);

/** Click-to-chat link. `text` pre-fills the message but the user still presses send. */
export function waLink(digits: string, text?: string): string {
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

// --- SQL twins of the functions above (over the sessions table) ---

const rawDigits = sql`regexp_replace(coalesce(${sessions.customerWhatsapp}, ''), '\\D', '', 'g')`;
const intlDigits = sql`(case when ${rawDigits} like '0%' then '62' || substr(${rawDigits}, 2) when ${rawDigits} like '8%' then '62' || ${rawDigits} else ${rawDigits} end)`;

/** The customer's WhatsApp number as 62…, or null. */
export const waSql: SQL = sql`(case when length(${intlDigits}) between 9 and 15 then ${intlDigits} end)`;
/** The customer's email, lower-cased, or null. */
export const emailSql: SQL = sql`lower(nullif(trim(${sessions.customerEmail}), ''))`;
/** Same value as contactKeyOf(). */
export const contactKeySql: SQL = sql`(case when ${waSql} is not null then 'wa:' || ${waSql} when ${emailSql} is not null then 'em:' || ${emailSql} end)`;

/** Greeting text offered when the owner taps "WhatsApp". Placeholders: {nama} {brand} {link}. */
export const DEFAULT_WA_TEMPLATE = "Halo {nama}, terima kasih sudah berfoto di {brand}! 📸 Ini hasil foto kamu: {link}";

export function fillTemplate(template: string, vars: { nama?: string | null; brand?: string | null; link?: string | null }): string {
  return template
    .replaceAll("{nama}", vars.nama?.trim() || "kak")
    .replaceAll("{brand}", vars.brand?.trim() || "kami")
    .replaceAll("{link}", vars.link?.trim() || "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
