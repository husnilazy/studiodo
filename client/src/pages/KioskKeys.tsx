import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { sectionClass } from "@/lib/adminUi";

const inputClass = "mt-1 w-full rounded-xl border border-fg/15 bg-fg/5 px-3 py-2.5 text-sm outline-none focus:border-accent";

type KioskDiagnostics = { cameraOk: boolean; printerOk: boolean; networkOk: boolean; checkedAt: string } | null;
type KioskKey = {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  appVersion?: string | null;
  lastDiagnostics?: KioskDiagnostics;
  boundDeviceId?: string | null;
  boundAt?: string | null;
  autoUpdateEnabled?: boolean;
  licenseType?: "trial" | "paid" | "unpaid";
  licenseEndsAt?: string | null;
  locked?: boolean;
  lockReason?: string | null;
  daysRemaining?: number | null;
  graceDaysRemaining?: number | null;
};

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // heartbeat/request tiap ~5 menit — 10 menit tanpa kabar = offline
const KIOSK_KEYS_PAGE_SIZE = 6;

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

function isRecentlyActive(lastUsedAt: string | null) {
  if (!lastUsedAt) return false;
  return Date.now() - new Date(lastUsedAt).getTime() < ONLINE_THRESHOLD_MS;
}

// One booth = one subscription. Shows where this key stands: trial (counting down), paid, never subscribed, or locked.
function LicenseBadge({ item }: { item: KioskKey }) {
  if (item.revokedAt) return <span className="text-fg/30">—</span>;
  const date = item.licenseEndsAt ? new Date(item.licenseEndsAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : null;
  if (item.licenseType === "unpaid") return <span className="rounded-full border border-red-400/30 px-2 py-0.5 text-[11px] text-red-300">Belum berlangganan</span>;
  if (item.locked) {
    return <span className="rounded-full border border-red-400/30 px-2 py-0.5 text-[11px] text-red-300">{item.licenseType === "trial" ? "Trial habis" : "Terkunci"}{date ? ` · ${date}` : ""}</span>;
  }
  if (item.licenseType === "trial") {
    return <span className="rounded-full border border-amber-400/30 px-2 py-0.5 text-[11px] text-amber-300">Trial · {Math.max(0, item.daysRemaining ?? 0)} hari lagi</span>;
  }
  if (item.graceDaysRemaining !== null && item.graceDaysRemaining !== undefined) {
    return <span className="rounded-full border border-amber-400/30 px-2 py-0.5 text-[11px] text-amber-300">Masa tenggang · {item.graceDaysRemaining} hari</span>;
  }
  return <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 text-[11px] text-emerald-300">{date ? `Aktif s/d ${date}` : "Aktif"}</span>;
}

function DiagnosticsSummary({ diagnostics }: { diagnostics?: KioskDiagnostics }) {
  if (!diagnostics) return <span className="text-fg/30">Belum ada laporan</span>;
  const items: { label: string; ok: boolean }[] = [
    { label: "Kamera", ok: diagnostics.cameraOk },
    { label: "Printer", ok: diagnostics.printerOk },
    { label: "Jaringan", ok: diagnostics.networkOk },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item.label} className={`rounded-full border px-2 py-0.5 text-[10px] ${item.ok ? "border-emerald-400/30 text-emerald-300" : "border-red-400/30 text-red-300"}`}>
          {item.label}
        </span>
      ))}
    </div>
  );
}

export default function KioskKeys() {
  const [keys, setKeys] = useState<KioskKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [portalUrl, setPortalUrl] = useState("https://www.studiodo.id/portal/booth");

  const refresh = () => {
    setLoading(true);
    api.getKioskKeys().then((rows) => setKeys(rows ?? [])).catch(() => setKeys([])).finally(() => setLoading(false));
  };

  useEffect(() => {
    api.getMe().then((me) => { if (me?.portalUrl) setPortalUrl(me.portalUrl); }).catch(() => undefined);
    refresh();
    // Quiet poll (no loading flicker) so online/offline + diagnostics stay
    // roughly live while this page is open, without the admin manually refreshing.
    const interval = setInterval(() => {
      api.getKioskKeys().then((rows) => setKeys(rows ?? [])).catch(() => undefined);
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const create = async () => {
    setError(null);
    setCreating(true);
    try {
      const result = await api.createKioskKey(label.trim());
      if (!result) throw new Error("Gagal membuat kiosk key");
      setNewKey(result.key);
      setLabel("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat kiosk key");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("Cabut kiosk key ini? Kiosk yang memakainya akan langsung berhenti bisa mengakses server.")) return;
    await api.revokeKioskKey(id).catch(() => undefined);
    refresh();
  };

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const toggleAutoUpdate = async (key: KioskKey) => {
    const next = !(key.autoUpdateEnabled ?? true);
    setTogglingId(key.id);
    // Optimistic — this kiosk won't actually pick it up until its next
    // heartbeat (up to 5 min), so waiting on a round-trip before reflecting
    // the admin's own click would just look unresponsive for no benefit.
    setKeys((current) => current.map((item) => (item.id === key.id ? { ...item, autoUpdateEnabled: next } : item)));
    try {
      await api.setKioskKeyAutoUpdate(key.id, next);
    } catch {
      setKeys((current) => current.map((item) => (item.id === key.id ? { ...item, autoUpdateEnabled: !next } : item)));
    } finally {
      setTogglingId(null);
    }
  };

  // Revealed keys stay in memory only (never persisted) — closing/reloading
  // the page hides them again, same as the "shown once" banner above, just
  // repeatable on demand instead of gone forever after the first close.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealError, setRevealError] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleReveal = async (id: string) => {
    if (revealed[id]) {
      setRevealed((current) => { const next = { ...current }; delete next[id]; return next; });
      return;
    }
    setRevealError((current) => { const next = { ...current }; delete next[id]; return next; });
    setRevealingId(id);
    try {
      const result = await api.revealKioskKey(id);
      if (!result) throw new Error("Gagal mengambil kiosk key");
      setRevealed((current) => ({ ...current, [id]: result.key }));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Gagal mengambil kiosk key";
      setRevealError((current) => ({ ...current, [id]: message }));
    } finally {
      setRevealingId(null);
    }
  };

  const copyRevealedKey = async (id: string) => {
    const value = revealed[id];
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
    } catch {
      // clipboard can be unavailable — the key is still shown to copy manually
    }
  };

  const [resettingId, setResettingId] = useState<string | null>(null);
  const resetDevice = async (id: string) => {
    if (!window.confirm("Reset device untuk kiosk key ini? Komputer yang sedang memakainya akan langsung ditolak sampai key ini dipasang ulang — pakai ini kalau kamu mengganti komputer booth ini.")) return;
    setResettingId(id);
    try {
      await api.resetKioskKeyDevice(id).catch(() => undefined);
      refresh();
    } finally {
      setResettingId(null);
    }
  };

  const copyKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard can be unavailable (e.g. no permission) — the key is still shown to copy manually
    }
  };

  const activeKeyCount = keys.filter((key) => !key.revokedAt).length;

  // History table used to render every kiosk key ever created (including old
  // test/revoked ones) in one long scroll — same "load more" pattern as
  // Database Foto & Video instead, so it starts short and you page through
  // history on demand.
  const [visibleCount, setVisibleCount] = useState(KIOSK_KEYS_PAGE_SIZE);
  const visibleKeys = keys.slice(0, visibleCount);

  const paidCount = keys.filter((key) => !key.revokedAt && key.licenseType === "paid" && !key.locked).length;
  const onlineCount = keys.filter((key) => !key.revokedAt && isRecentlyActive(key.lastUsedAt)).length;
  const hasUnpaid = keys.some((key) => !key.revokedAt && key.licenseType === "unpaid");

  return (
    <div className="space-y-5">
      <section className={sectionClass}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">KIOSK</p>
            <h3 className="font-display text-2xl font-semibold">Kiosk API key</h3>
            <p className="mt-1 text-sm text-fg/50">Satu key = satu booth = satu langganan. Tempel key ke layar "Setup / Pair kiosk ini" di aplikasi kiosk.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-fg/10 bg-surface px-3 py-1.5"><b className="text-fg">{activeKeyCount}</b> <span className="text-fg/50">booth aktif</span></span>
            <span className="rounded-full border border-fg/10 bg-surface px-3 py-1.5"><b className="text-emerald-500">{onlineCount}</b> <span className="text-fg/50">online</span></span>
            <span className="rounded-full border border-fg/10 bg-surface px-3 py-1.5"><b className="text-fg">{paidCount}</b> <span className="text-fg/50">berlangganan</span></span>
          </div>
        </div>
        {hasUnpaid && <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">Ada booth yang belum berlangganan, kiosknya terkunci. Aktifkan di <a href={portalUrl} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">dashboard web STUDIODO</a>.</p>}

        <details className="group mt-3 rounded-xl border border-fg/10 bg-fg/[0.03] px-4 py-2.5 text-sm text-fg/55">
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wider text-fg/60">Cara kerja key <span className="ml-1 normal-case tracking-normal text-fg/35 group-open:hidden">(klik untuk membuka)</span></summary>
          <div className="mt-2 space-y-2 pb-1 text-xs leading-relaxed">
            <p>Satu key hanya bisa aktif di satu komputer. Kalau ganti hardware, pakai "Reset device" pada key tersebut, bukan membuat key baru.</p>
            <p>Key baru bisa dipasangkan, tetapi kiosknya terkunci sampai booth itu berlangganan di <a href={portalUrl} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-4">dashboard web STUDIODO</a> (Booth &amp; langganan). Di sana kamu juga bisa membayar banyak booth sekaligus dan dapat potongan harga.</p>
          </div>
        </details>

        {newKey && (
          <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
            <p className="text-sm font-semibold text-emerald-600">Kiosk key baru dibuat. Simpan sekarang, tidak akan ditampilkan lagi.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-black/30 px-3 py-2 text-xs text-white/80">{newKey}</code>
              <button type="button" onClick={copyKey} className="rounded-lg border border-fg/15 px-3 py-2 text-xs text-fg/70 hover:border-accent hover:text-fg">
                {copied ? "Tersalin!" : "Salin"}
              </button>
            </div>
            <button type="button" onClick={() => setNewKey(null)} className="mt-3 text-xs text-fg/40 hover:text-fg/70">Tutup</button>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-fg/10 pt-4">
          <label className="min-w-[220px] flex-1 text-sm text-fg/60">
            Label (opsional, catatan kiosk mana)
            <input className={inputClass} placeholder="mis. Kiosk depan / Booth event Sabtu" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <button type="button" onClick={create} disabled={creating} className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold shadow-lg shadow-accent/20 disabled:cursor-not-allowed disabled:opacity-50">
            {creating ? "Membuat…" : "+ Buat kiosk key baru"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      </section>

      {loading && keys.length === 0 && <p className={`${sectionClass} text-center text-fg/40`}>Memuat…</p>}
      {!loading && keys.length === 0 && <p className={`${sectionClass} text-center text-fg/40`}>Belum ada kiosk key. Buat satu untuk mulai pairing kiosk.</p>}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {visibleKeys.map((key) => {
          const online = !key.revokedAt && isRecentlyActive(key.lastUsedAt);
          const autoUpdate = key.autoUpdateEnabled ?? true;
          return (
            <article key={key.id} className={`flex flex-col rounded-2xl border bg-surface p-4 shadow-glass ${key.revokedAt ? "border-fg/10 opacity-60" : "border-fg/10"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{key.label || "Tanpa label"}</p>
                  <p className={`mt-0.5 inline-flex items-center gap-1.5 text-xs ${online ? "text-emerald-500" : "text-fg/40"}`}><span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-fg/30"}`} />{online ? "Online" : "Offline"}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${key.revokedAt ? "bg-red-400/15 text-red-500" : "bg-emerald-400/15 text-emerald-600"}`}>{key.revokedAt ? "Dicabut" : "Aktif"}</span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div><dt className="text-fg/40">Device</dt><dd className="mt-0.5 text-fg/70" title={key.boundDeviceId ?? undefined}>{key.boundDeviceId ? `Terpasang${key.boundAt ? ` · ${formatDate(key.boundAt)}` : ""}` : <span className="text-fg/30">Belum dipasang</span>}</dd></div>
                <div><dt className="text-fg/40">Versi app</dt><dd className="mt-0.5 text-fg/70">{key.appVersion || "-"}</dd></div>
                <div><dt className="text-fg/40">Terakhir dipakai</dt><dd className="mt-0.5 text-fg/70">{formatDate(key.lastUsedAt)}</dd></div>
                <div><dt className="text-fg/40">Langganan</dt><dd className="mt-0.5"><LicenseBadge item={key} /></dd></div>
                <div className="col-span-2"><dt className="text-fg/40">Diagnostik terakhir</dt><dd className="mt-1"><DiagnosticsSummary diagnostics={key.lastDiagnostics} /></dd></div>
              </dl>

              {!key.revokedAt && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-fg/[0.04] px-3 py-2">
                  <span className="text-xs text-fg/60">Auto-update aplikasi</span>
                  <button
                    type="button"
                    onClick={() => toggleAutoUpdate(key)}
                    disabled={togglingId === key.id}
                    title={autoUpdate ? "Update otomatis aktif, klik untuk matikan" : "Update otomatis mati, klik untuk aktifkan"}
                    className={`relative h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-50 ${autoUpdate ? "border-accent/40 bg-accent/60" : "border-fg/15 bg-fg/10"}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${autoUpdate ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>
              )}

              {(revealed[key.id] || revealError[key.id]) && (
                <div className="mt-3 rounded-xl bg-fg/5 p-3">
                  {revealed[key.id] ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="min-w-0 flex-1 break-all rounded-lg bg-black/30 px-3 py-2 text-xs text-white/80">{revealed[key.id]}</code>
                      <button type="button" onClick={() => copyRevealedKey(key.id)} className="rounded-lg border border-fg/15 px-3 py-2 text-xs text-fg/70 hover:border-accent hover:text-fg">{copiedId === key.id ? "Tersalin!" : "Salin"}</button>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600">{revealError[key.id]}</p>
                  )}
                </div>
              )}

              {!key.revokedAt && (
                <div className="mt-auto flex flex-wrap gap-1.5 border-t border-fg/10 pt-3">
                  {(key.licenseType !== "paid" || key.locked || (key.daysRemaining ?? 99) <= 14) && (
                    <a href={portalUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white">
                      {key.licenseType === "paid" && !key.locked ? "Perpanjang" : "Berlangganan"}
                    </a>
                  )}
                  <button type="button" disabled={revealingId === key.id} onClick={() => toggleReveal(key.id)} className="rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/60 hover:border-accent hover:text-fg disabled:opacity-50">
                    {revealingId === key.id ? "Memuat…" : revealed[key.id] ? "Sembunyikan" : "Lihat key"}
                  </button>
                  {key.boundDeviceId && (
                    <button type="button" disabled={resettingId === key.id} onClick={() => resetDevice(key.id)} className="rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/60 hover:border-accent hover:text-fg disabled:opacity-50">
                      {resettingId === key.id ? "Mereset…" : "Reset device"}
                    </button>
                  )}
                  <button type="button" onClick={() => revoke(key.id)} className="ml-auto rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/60 hover:border-red-400 hover:text-red-500">Cabut</button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {visibleCount < keys.length && (
        <button type="button" onClick={() => setVisibleCount((count) => count + KIOSK_KEYS_PAGE_SIZE)} className="w-full rounded-xl border border-fg/15 py-2.5 text-sm text-fg/60 hover:border-accent hover:text-fg">
          Muat lebih banyak ({keys.length - visibleCount} lagi)
        </button>
      )}
    </div>
  );
}
