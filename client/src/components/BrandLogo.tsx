import { useEffect, useState } from "react";
import inkLogo from "@/assets/studiodo-wordmark-ink.png";
import whiteLogo from "@/assets/studiodo-wordmark-white.png";
import { getApiBaseUrl } from "@/lib/apiConfig";

// The logo uploaded in Superadmin → Konten Website → Pengaturan umum is the one source of truth for the STUDIODO
// wordmark: the website, the dashboard and these admin screens all show it. The bundled PNGs are only the fallback
// (offline, or nothing uploaded yet). The last answer is cached so the next screen paints the right logo at once.

const CACHE_KEY = "studiodo-site-logos";
type Logos = { light: string | null; dark: string | null };

function readCache(): Logos {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as Logos | null;
    if (parsed && typeof parsed === "object") return { light: parsed.light ?? null, dark: parsed.dark ?? null };
  } catch { /* storage unavailable or corrupt: fall through */ }
  return { light: null, dark: null };
}

let inflight: Promise<Logos> | null = null;
function fetchLogos(): Promise<Logos> {
  inflight ??= (async () => {
    const base = getApiBaseUrl().replace(/\/$/, "");
    const origin = base.replace(/\/api$/, "");
    const res = await fetch(`${base}/public/content`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const site = ((await res.json()) as { site?: { logoUrl?: string; logoDarkUrl?: string } }).site ?? {};
    // Only the server's own asset route is trusted — the value comes from a CMS field.
    const abs = (p?: string) => (p && /^\/api\/public\/assets\/[0-9a-f-]{36}$/i.test(p) ? `${origin}${p}` : null);
    const logos = { light: abs(site.logoUrl), dark: abs(site.logoDarkUrl) };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(logos)); } catch { /* cache is optional */ }
    return logos;
  })().finally(() => { setTimeout(() => { inflight = null; }, 60_000); });
  return inflight;
}

export function useSiteLogos(): Logos {
  const [logos, setLogos] = useState<Logos>(readCache);
  useEffect(() => {
    let alive = true;
    fetchLogos().then((l) => { if (alive) setLogos(l); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return logos;
}

/**
 * The STUDIODO wordmark for the admin screens. Both versions are rendered and CSS (see `.brand-logo-*` in index.css)
 * shows the one that fits the admin's current light/dark theme, so it also follows the "system" setting live.
 * With only a light-mode logo uploaded it is used in both themes (same rule as the website).
 */
export function BrandLogo({ className = "h-8" }: { className?: string }) {
  const { light, dark } = useSiteLogos();
  const forLightTheme = light ?? dark ?? inkLogo;
  const forDarkTheme = dark ?? light ?? whiteLogo;
  return (
    <span className="inline-flex" aria-label="STUDIODO" role="img">
      <img src={forLightTheme} alt="" draggable={false} className={`brand-logo-ink w-auto max-w-[200px] select-none object-contain ${className}`} />
      <img src={forDarkTheme} alt="" draggable={false} className={`brand-logo-white w-auto max-w-[200px] select-none object-contain ${className}`} />
    </span>
  );
}
