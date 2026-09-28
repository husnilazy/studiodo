import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { StudiodoUpdaterStatus } from "@/types/electron";

const inputClass = "mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-accent";

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

function DiagnosticsSummary({ diagnostics }: { diagnostics?: KioskDiagnostics }) {
  if (!diagnostics) return <span className="text-white/30">Belum ada laporan</span>;
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

// The auto-updater (electron/main.cjs) already checked GitHub Releases,
// auto-downloaded, and installed on restart from the start — but nothing
// anywhere showed that it existed, ran, or found anything, so from an
// admin's side there was no visible "update feature" at all, just silent
// background behavior nobody could see or trigger on demand. Hidden
// entirely outside the Electron app (plain browser admin-in-a-tab) since
// there's nothing there to update.
function AppUpdateCard() {
  const [status, setStatus] = useState<StudiodoUpdaterStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!window.studiodo?.getUpdaterStatus) return;
    window.studiodo.getUpdaterStatus().then(setStatus).catch(() => undefined);
  }, []);

  if (!window.studiodo?.getUpdaterStatus) return null;

  const checkNow = async () => {
    setChecking(true);
    try {
      setStatus(await window.studiodo!.checkForUpdate());
    } finally {
      setChecking(false);
    }
  };

  const statusLabel = (() => {
    if (checking || status?.state === "checking") return "Mengecek update...";
    switch (status?.state) {
      case "downloading": return `Mengunduh update v${status.version} — ${status.progressPercent ?? 0}%`;
      case "downloaded": return `Update v${status.version} siap — otomatis terpasang saat aplikasi ditutup & dibuka lagi`;
      case "available": return `Update v${status.version} ditemukan, sedang diunduh di latar belakang...`;
      case "not-available": return "Sudah pakai versi terbaru";
      case "error": return `Gagal cek update: ${status.error}`;
      default: return "Belum pernah dicek sejak app ini dibuka";
    }
  })();

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Aplikasi kiosk — komputer ini</p>
        <p className="mt-1 text-sm font-semibold">Versi {status?.currentVersion ?? "-"}</p>
        <p className="mt-0.5 text-xs text-white/50">{statusLabel}</p>
      </div>
      <button
        type="button"
        onClick={checkNow}
        disabled={checking}
        className="shrink-0 rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-white/70 hover:border-accent hover:text-white disabled:cursor-wait disabled:opacity-50"
      >
        {checking ? "Mengecek..." : "Cek update sekarang"}
      </button>
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
  const [kioskLimit, setKioskLimit] = useState<number | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    api.getKioskKeys().then((rows) => setKeys(rows ?? [])).catch(() => setKeys([])).finally(() => setLoading(false));
  };

  useEffect(() => {
    api.getPlanFeatures().then((result) => {
      if (!result) return;
      setKioskLimit(result.kioskLimit);
      setPlanName(result.planName);
    }).catch(() => undefined);
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
  const atLimit = kioskLimit != null && activeKeyCount >= kioskLimit;

  // History table used to render every kiosk key ever created (including old
  // test/revoked ones) in one long scroll — same "load more" pattern as
  // Database Foto & Video instead, so it starts short and you page through
  // history on demand.
  const [visibleCount, setVisibleCount] = useState(KIOSK_KEYS_PAGE_SIZE);
  const visibleKeys = keys.slice(0, visibleCount);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/10 backdrop-blur-xl md:p-8">
        <p className="eyebrow">KIOSK</p>
        <h3 className="mt-2 font-display text-3xl font-semibold">Kiosk API key</h3>
        <p className="mt-2 max-w-xl text-sm text-white/45">
          Tiap kiosk fisik butuh satu key untuk terhubung ke server. Tempel key ke layar
          "Setup / Pair kiosk ini" di aplikasi Electron kiosk tersebut. Satu key hanya bisa
          aktif di satu komputer — kalau ganti hardware, pakai "Reset device" di bawah,
          bukan membuat key baru.
        </p>
        <p className="mt-2 text-xs text-white/40">
          {activeKeyCount} / {kioskLimit ?? "∞"} kiosk aktif{planName ? ` — paket ${planName}` : ""}
          {atLimit && <span className="ml-2 text-amber-300">Sudah mencapai batas paket kamu. Cabut kiosk lain atau upgrade paket untuk menambah.</span>}
        </p>

        <AppUpdateCard />

        {newKey && (
          <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
            <p className="text-sm font-semibold text-emerald-200">Kiosk key baru dibuat — simpan sekarang, tidak akan ditampilkan lagi.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="flex-1 break-all rounded-lg bg-black/30 px-3 py-2 text-xs text-white/80">{newKey}</code>
              <button type="button" onClick={copyKey} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70 hover:border-accent hover:text-white">
                {copied ? "Tersalin!" : "Salin"}
              </button>
            </div>
            <button type="button" onClick={() => setNewKey(null)} className="mt-3 text-xs text-white/40 hover:text-white/70">Tutup</button>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-white/10 pt-5">
          <label className="flex-1 text-sm text-white/60">
            Label (opsional, buat catatan kiosk mana)
            <input className={inputClass} placeholder="mis. Kiosk depan / Booth event Sabtu" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <button
            type="button"
            onClick={create}
            disabled={creating || atLimit}
            title={atLimit ? "Sudah mencapai batas kiosk paket kamu" : undefined}
            className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold shadow-lg shadow-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Membuat…" : atLimit ? "Batas kiosk tercapai" : "Buat kiosk key baru"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

        <div className="mt-8 overflow-x-auto border-t border-white/10 pt-5">
          <table className="w-full text-left text-sm">
            <thead className="text-white/45">
              <tr>
                <th className="p-3">Label</th>
                <th className="p-3">Online</th>
                <th className="p-3">Device</th>
                <th className="p-3">Versi app</th>
                <th className="p-3">Diagnostik terakhir</th>
                <th className="p-3">Terakhir dipakai</th>
                <th className="p-3">Status key</th>
                <th className="p-3">Auto-update</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {visibleKeys.map((key) => (
                <tr key={key.id} className="border-t border-white/10">
                  <td className="p-3">{key.label || "-"}</td>
                  <td className="p-3">
                    {!key.revokedAt && isRecentlyActive(key.lastUsedAt) ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Online</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-white/40"><span className="h-1.5 w-1.5 rounded-full bg-white/30" />Offline</span>
                    )}
                  </td>
                  <td className="p-3">
                    {key.boundDeviceId ? (
                      <span className="inline-flex items-center gap-1.5 text-white/60" title={key.boundDeviceId}>
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                        Terpasang{key.boundAt ? ` · ${formatDate(key.boundAt)}` : ""}
                      </span>
                    ) : (
                      <span className="text-white/30">Belum dipasang</span>
                    )}
                  </td>
                  <td className="p-3 text-white/60">{key.appVersion || "-"}</td>
                  <td className="p-3"><DiagnosticsSummary diagnostics={key.lastDiagnostics} /></td>
                  <td className="p-3 text-white/60">{formatDate(key.lastUsedAt)}</td>
                  <td className="p-3">
                    {key.revokedAt ? <span className="text-red-300">Dicabut</span> : <span className="text-emerald-300">Aktif</span>}
                  </td>
                  <td className="p-3">
                    {!key.revokedAt && (
                      <button
                        type="button"
                        onClick={() => toggleAutoUpdate(key)}
                        disabled={togglingId === key.id}
                        title={key.autoUpdateEnabled ?? true ? "Update otomatis aktif — klik untuk matikan" : "Update otomatis mati — klik untuk aktifkan"}
                        className={`relative h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-50 ${(key.autoUpdateEnabled ?? true) ? "border-accent/40 bg-accent/60" : "border-white/15 bg-white/10"}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${(key.autoUpdateEnabled ?? true) ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1.5">
                    {!key.revokedAt && (
                      <button type="button" disabled={revealingId === key.id} onClick={() => toggleReveal(key.id)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 hover:border-accent hover:text-white disabled:opacity-50">
                        {revealingId === key.id ? "Memuat…" : revealed[key.id] ? "Sembunyikan" : "Lihat key"}
                      </button>
                    )}
                    {!key.revokedAt && key.boundDeviceId && (
                      <button type="button" disabled={resettingId === key.id} onClick={() => resetDevice(key.id)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 hover:border-accent hover:text-white disabled:opacity-50">
                        {resettingId === key.id ? "Mereset…" : "Reset device"}
                      </button>
                    )}
                    {!key.revokedAt && (
                      <button type="button" onClick={() => revoke(key.id)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 hover:border-red-400 hover:text-red-300">
                        Cabut
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
              {visibleKeys.map((key) => (revealed[key.id] || revealError[key.id]) && (
                <tr key={`${key.id}-reveal`} className="border-t border-white/5 bg-black/20">
                  <td colSpan={8} className="p-3">
                    {revealed[key.id] ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-white/40">{key.label || "Kiosk key"}:</span>
                        <code className="flex-1 break-all rounded-lg bg-black/30 px-3 py-2 text-xs text-white/80">{revealed[key.id]}</code>
                        <button type="button" onClick={() => copyRevealedKey(key.id)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70 hover:border-accent hover:text-white">
                          {copiedId === key.id ? "Tersalin!" : "Salin"}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-300/80">{revealError[key.id]}</p>
                    )}
                  </td>
                </tr>
              ))}
              {loading && keys.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-white/40">Memuat…</td></tr>
              )}
              {!loading && keys.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-white/40">Belum ada kiosk key. Buat satu untuk mulai pairing kiosk.</td></tr>
              )}
            </tbody>
          </table>
          {visibleCount < keys.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + KIOSK_KEYS_PAGE_SIZE)}
              className="mt-4 w-full rounded-xl border border-white/15 py-2.5 text-sm text-white/60 hover:border-accent hover:text-white"
            >
              Muat lebih banyak ({keys.length - visibleCount} lagi)
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
