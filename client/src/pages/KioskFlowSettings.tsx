import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { useBoothConfig } from "@/lib/boothConfigStore";
import {
  STEP_DEFS,
  LOCKED_STEPS,
  DEFAULT_KIOSK_FLOW,
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
  const [order, setOrder] = useState<KioskStepKey[]>(DEFAULT_KIOSK_FLOW.order as KioskStepKey[]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(DEFAULT_KIOSK_FLOW.enabled);
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
      }
    }).finally(() => setLoading(false));
  }, []);

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
    if (!validation.ok) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await api.updateKioskFlow({ order, enabled });
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
  };

  if (loading) return null;

  return (
    <section className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/10 backdrop-blur-xl md:p-8">
      <p className="eyebrow">KIOSK</p>
      <h3 className="mt-2 font-display text-3xl font-semibold">Flow Kiosk</h3>
      <p className="mt-2 max-w-xl text-sm text-white/45">
        Atur urutan layar yang dilihat customer, dan nyalakan/matikan step opsional. Drag untuk pindah urutan.
        Step bertanda "Wajib" tidak bisa dimatikan atau dilepas dari urutan relatifnya karena dibutuhkan datanya
        oleh step lain (mis. Pembayaran butuh paket sudah dipilih).
      </p>

      <div className="mt-6 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Halaman Awal (Idle)</p>
          <p className="text-xs text-white/40">Layar pertama yang dilihat customer, sebelum menyentuh layar.</p>
        </div>
        <Link href="/admin/screen-builder/idle" className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 hover:border-accent hover:text-white">
          Desain
        </Link>
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
                dragOverIndex === index ? "border-accent bg-accent/10" : "border-white/10 bg-black/20"
              } ${isOff ? "opacity-50" : ""}`}
            >
              <span className="select-none text-white/30">⠿</span>
              <span className="w-6 shrink-0 text-center text-xs text-white/40">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{def.label}</p>
                <p className="truncate text-xs text-white/40">{def.hint}</p>
              </div>
              {DESIGNABLE_SCREENS.has(key) ? (
                <Link href={`/admin/screen-builder/${key}`} className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 hover:border-accent hover:text-white">
                  Desain
                </Link>
              ) : (
                <span className="shrink-0 rounded-lg border border-white/5 px-3 py-1.5 text-xs text-white/20" title="Belum bisa didesain (Fase 5b)">Desain</span>
              )}
              {isLocked ? (
                <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent">Wajib</span>
              ) : (
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${isOff ? "bg-white/15" : "bg-accent"}`}
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
          disabled={saving || !validation.ok}
          className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
        <button type="button" onClick={resetDefault} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-white/60 hover:text-white">
          Reset ke default
        </button>
        {message && <span className="text-sm text-white/50">{message}</span>}
      </div>
    </section>
  );
}
