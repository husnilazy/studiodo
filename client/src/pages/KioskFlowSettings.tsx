import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { useBoothConfig } from "@/lib/boothConfigStore";
import {
  STEP_DEFS,
  LOCKED_STEPS,
  DEFAULT_KIOSK_FLOW,
  FLOW_PRESETS,
  matchPreset,
  validateFlowOrder,
  type KioskStepKey,
  type KioskFlowConfig,
} from "@/lib/kioskFlow";

// Which screens have been wrapped with <Positionable> and can be opened in the
// WYSIWYG builder. Fase 5a wired up "tutorial"; Fase 5b wraps the rest of the
// reorderable steps. "idle" (the very first screen, not part of this reorderable
// list) gets its own entry point below since it isn't a step in `order`.
const DESIGNABLE_SCREENS = new Set<KioskStepKey>(["tutorial", "packages", "orientation", "payment", "frame", "capture", "preview", "result"]);

function isValidStoredFlow(value: unknown): value is KioskFlowConfig {
  return !!value && typeof value === "object" && Array.isArray((value as KioskFlowConfig).order) && (value as KioskFlowConfig).order.length === DEFAULT_KIOSK_FLOW.order.length;
}

export default function KioskFlowSettings() {
  const socialPopupOn = useBoothConfig((s) => Boolean(s.config.features.socialConsentPopup));
  const [order, setOrder] = useState<KioskStepKey[]>(DEFAULT_KIOSK_FLOW.order as KioskStepKey[]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(DEFAULT_KIOSK_FLOW.enabled);
  const [mode, setMode] = useState<"standard" | "single">("standard");
  const [singlePackageId, setSinglePackageId] = useState<string | null>(null);
  const [packageList, setPackageList] = useState<{ id: string; name: string; price: string | number; photoCount: number; active?: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    api.getTenantConfig().then((config) => {
      const stored = config?.kioskFlow;
      if (isValidStoredFlow(stored)) {
        setOrder(stored.order as KioskStepKey[]);
        setEnabled({ ...DEFAULT_KIOSK_FLOW.enabled, ...stored.enabled });
        setMode(stored.mode === "single" ? "single" : "standard");
        setSinglePackageId(stored.singlePackageId ?? null);
      }
    }).finally(() => setLoading(false));
    api.getPackagesAll().then((list) => setPackageList(list ?? [])).catch(() => setPackageList([]));
  }, []);

  const activePackages = packageList.filter((pkg) => pkg.active !== false);
  const currentPreset = matchPreset({ order, enabled, mode });
  const applyPreset = (id: string) => {
    const preset = FLOW_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setOrder(DEFAULT_KIOSK_FLOW.order as KioskStepKey[]);
    setEnabled({ ...DEFAULT_KIOSK_FLOW.enabled, ...preset.enabled });
    setMode(preset.mode);
    if (preset.mode === "single" && !singlePackageId && activePackages[0]) setSinglePackageId(activePackages[0].id);
    setMessage("");
  };
  const singleMissing = mode === "single" && !singlePackageId;

  const validation = validateFlowOrder({ order, enabled });

  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    setOrder((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const toggle = (key: KioskStepKey) => {
    if (LOCKED_STEPS.includes(key)) return;
    setEnabled((current) => ({ ...current, [key]: current[key] === false ? true : false }));
  };

  const save = async () => {
    if (!validation.ok || singleMissing) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await api.updateKioskFlow({ order, enabled, mode, singlePackageId: mode === "single" ? singlePackageId : null });
      if (!result) throw new Error("Gagal menyimpan");
      // The admin dashboard and the live kiosk share this same in-memory store —
      // without this, the change only takes effect after a full page reload
      // (e.g. re-pairing), since nothing else re-fetches /config/tenant.
      useBoothConfig.getState().update({ kioskFlow: result.kioskFlow });
      setMessage("Tersimpan.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const resetDefault = () => {
    setOrder(DEFAULT_KIOSK_FLOW.order as KioskStepKey[]);
    setEnabled(DEFAULT_KIOSK_FLOW.enabled);
    setMode("standard");
  };

  if (loading) return null;

  return (
    <section className="mx-auto max-w-4xl rounded-[2rem] border border-fg/10 bg-fg/[0.045] p-5 shadow-2xl shadow-black/10 backdrop-blur-xl md:p-8">
      <p className="eyebrow">KIOSK</p>
      <h3 className="mt-2 font-display text-3xl font-semibold">Flow Kiosk</h3>
      <p className="mt-2 max-w-xl text-sm text-fg/45">
        Atur urutan layar yang dilihat customer, dan nyalakan/matikan step opsional. Drag untuk pindah urutan.
        Step bertanda "Wajib" tidak bisa dimatikan atau dilepas dari urutan relatifnya karena dibutuhkan datanya
        oleh step lain (mis. Pembayaran butuh paket sudah dipilih).
      </p>

      <div className="mt-6">
        <p className="text-sm font-semibold">Mode alur</p>
        <p className="text-xs text-fg/40">Pilih satu gaya alur dengan sekali ketuk, lalu sesuaikan detailnya di bawah bila perlu. Jangan lupa tekan Simpan.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {FLOW_PRESETS.map((preset) => {
            const active = currentPreset?.id === preset.id;
            return (
              <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} aria-pressed={active} className={`rounded-2xl border p-4 text-left transition ${active ? "border-accent bg-accent/10 shadow-md" : "border-fg/10 bg-fg/5 hover:border-fg/30"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{preset.label}</p>
                  {active && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Dipakai</span>}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-fg/55">{preset.description}</p>
                <p className="mt-2 text-[11px] font-medium text-accent">{preset.steps}</p>
              </button>
            );
          })}
        </div>
        {!currentPreset && <p className="mt-2 text-xs text-amber-500">Alur sekarang sudah disesuaikan sendiri (tidak sama persis dengan salah satu mode di atas).</p>}

        {mode === "single" && (
          <div className="mt-4 rounded-2xl border border-accent/30 bg-accent/5 p-4">
            <p className="text-sm font-semibold">Paket yang dijual (satu harga)</p>
            <p className="mt-0.5 text-xs text-fg/50">Customer tidak memilih paket. Kiosk langsung memakai paket ini, lalu customer hanya menambah jumlah print. Harga per lembar tambahan diatur di Printer → Additional print.</p>
            <select value={singlePackageId ?? ""} onChange={(e) => setSinglePackageId(e.target.value || null)} className="mt-3 w-full rounded-xl border border-fg/15 bg-canvas px-3 py-2.5 text-sm">
              <option value="">— Pilih paket —</option>
              {activePackages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>{pkg.name} — Rp {Number(pkg.price).toLocaleString("id-ID")} · {pkg.photoCount} foto</option>
              ))}
            </select>
            {activePackages.length === 0 && <p className="mt-2 text-xs text-amber-500">Belum ada paket aktif. Buat dulu di Keuangan → Paket (mis. "Paket 30rb").</p>}
            {singleMissing && activePackages.length > 0 && <p className="mt-2 text-xs text-amber-500">Pilih paket dulu sebelum menyimpan.</p>}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between rounded-xl border border-fg/10 bg-fg/5 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Halaman Awal (Idle)</p>
          <p className="text-xs text-fg/40">Layar pertama yang dilihat customer, sebelum menyentuh layar.</p>
        </div>
        <Link href="/admin/screen-builder/idle" className="shrink-0 rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/60 hover:border-accent hover:text-fg">
          Desain
        </Link>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-fg/10 bg-fg/5 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Pop-up izin unggah ke sosial media</p>
          <p className="text-xs text-fg/40">Muncul sekali sebelum layar hasil: "Boleh fotomu diunggah di sosmed kami?" (Ya / Tidak). Jawabannya tersimpan di data sesi dan pelanggan.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            const store = useBoothConfig.getState();
            store.update({ features: { ...store.config.features, socialConsentPopup: !store.config.features.socialConsentPopup } });
          }}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${socialPopupOn ? "bg-accent" : "bg-fg/15"}`}
          aria-label="Aktifkan atau matikan pop-up izin sosial media"
          aria-pressed={socialPopupOn}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${socialPopupOn ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {order.map((key, index) => {
          const def = STEP_DEFS[key];
          const isLocked = LOCKED_STEPS.includes(key);
          const isOff = !isLocked && enabled[key] === false;
          return (
            <div
              key={key}
              draggable
              onDragStart={() => { dragIndex.current = index; }}
              onDragOver={(event) => { event.preventDefault(); setDragOverIndex(index); }}
              onDragLeave={() => setDragOverIndex((current) => (current === index ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                if (dragIndex.current !== null) moveTo(dragIndex.current, index);
                dragIndex.current = null;
                setDragOverIndex(null);
              }}
              onDragEnd={() => { dragIndex.current = null; setDragOverIndex(null); }}
              className={`flex cursor-grab items-center gap-3 rounded-xl border px-4 py-3 transition active:cursor-grabbing ${
                dragOverIndex === index ? "border-accent bg-accent/10" : "border-fg/10 bg-fg/5"
              } ${isOff ? "opacity-50" : ""}`}
            >
              <span className="select-none text-fg/30">⠿</span>
              <span className="w-6 shrink-0 text-center text-xs text-fg/40">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{def.label}</p>
                <p className="truncate text-xs text-fg/40">{def.hint}</p>
              </div>
              {DESIGNABLE_SCREENS.has(key) ? (
                <Link href={`/admin/screen-builder/${key}`} className="shrink-0 rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/60 hover:border-accent hover:text-fg">
                  Desain
                </Link>
              ) : (
                <span className="shrink-0 rounded-lg border border-fg/5 px-3 py-1.5 text-xs text-fg/20" title="Belum bisa didesain (Fase 5b)">Desain</span>
              )}
              {isLocked ? (
                <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent">Wajib</span>
              ) : (
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${isOff ? "bg-fg/15" : "bg-accent"}`}
                  aria-label={`Aktifkan/matikan ${def.label}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${isOff ? "left-0.5" : "left-[22px]"}`} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!validation.ok && (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-300">{validation.error}</p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !validation.ok || singleMissing}
          className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
        <button type="button" onClick={resetDefault} className="rounded-xl border border-fg/15 px-4 py-3 text-sm text-fg/60 hover:text-fg">
          Reset ke default
        </button>
        {message && <span className="text-sm text-fg/50">{message}</span>}
      </div>
    </section>
  );
}
