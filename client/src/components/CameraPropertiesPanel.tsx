import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useBoothConfig } from "@/lib/boothConfigStore";
import {
  driveTetherFocus,
  focusTetherCamera,
  getCameraProperties,
  setCameraProperties,
  type CameraProperties,
  type CameraPropertyState,
} from "@/lib/camera";
import { inputClass, sectionClass } from "@/lib/adminUi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";

// Property names are the bridge's own (see native/canon-bridge-src/CameraProps.cs and
// electron/digicam-bridge.cjs). Labels come from the bridge when it sends them; these are the
// fallbacks for older bridges that only report { value, choices }.
const FALLBACK_LABELS: Record<string, string> = {
  iso: "ISO",
  shutterspeed: "Shutter Speed",
  aperture: "Aperture",
  whitebalance: "White Balance",
  exposurecomp: "Kompensasi Eksposur (EV)",
  exposurecompensation: "Kompensasi Eksposur (EV)",
  exposuremode: "Mode Eksposur",
  meteringmode: "Metering",
  afmode: "Mode Autofocus",
  focusmode: "Mode Autofocus",
  focusarea: "Area Fokus",
  picturestyle: "Picture Style",
  imagequality: "Kualitas Foto",
  imagesize: "Ukuran Foto",
  compressionsetting: "Kualitas & Ukuran Foto",
};

// Where each property sits when the bridge does not say (older digiCamControl bridge).
const FALLBACK_GROUP: Record<string, string> = {
  iso: "exposure", shutterspeed: "exposure", aperture: "exposure", exposurecomp: "exposure", exposurecompensation: "exposure",
  exposuremode: "exposure", meteringmode: "exposure", afmode: "focus", focusmode: "focus", focusarea: "focus",
  whitebalance: "color", picturestyle: "color", imagequality: "output", imagesize: "output", compressionsetting: "output",
};

const TRIANGLE = [
  { key: "iso", title: "ISO", hint: "Kepekaan sensor. Lebih tinggi = foto lebih terang, tapi lebih berbintik (noise). Booth indoor: 400–1600." },
  { key: "shutterspeed", title: "Shutter", hint: "Lama sensor menerima cahaya. Lebih cepat = gerakan beku & tidak blur. Booth: sekitar 1/125 atau lebih cepat." },
  { key: "aperture", title: "Aperture", hint: "Bukaan lensa. Angka kecil = terang & latar blur; angka besar = lebih tajam merata. Foto grup: F4–F5.6." },
];

const GROUPS: { id: string; eyebrow: string; title: string }[] = [
  { id: "exposure", eyebrow: "EKSPOSUR", title: "Eksposur lainnya" },
  { id: "focus", eyebrow: "FOKUS", title: "Autofocus" },
  { id: "color", eyebrow: "WARNA", title: "Warna" },
  { id: "output", eyebrow: "HASIL", title: "Hasil foto" },
  { id: "power", eyebrow: "DAYA", title: "Hemat daya & suhu" },
];

const labelOf = (name: string, state?: CameraPropertyState) => state?.label ?? FALLBACK_LABELS[name] ?? name;
const groupOf = (name: string, state?: CameraPropertyState) => state?.group ?? FALLBACK_GROUP[name] ?? "other";
const usable = (state?: CameraPropertyState) => Boolean(state && !state.error && state.choices.length > 0);

function TriangleGlyph() {
  return (
    <svg viewBox="0 0 64 56" className="h-14 w-16 shrink-0" aria-hidden="true">
      <polygon points="32,6 58,50 6,50" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" className="text-accent" />
      <circle cx="32" cy="6" r="4" fill="currentColor" className="text-accent" />
      <circle cx="58" cy="50" r="4" fill="currentColor" className="text-accent" />
      <circle cx="6" cy="50" r="4" fill="currentColor" className="text-accent" />
    </svg>
  );
}

function Select({ name, state, value, onChange }: { name: string; state: CameraPropertyState; value: string; onChange: (value: string) => void }) {
  if (state.writable === false) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-fg/10 bg-fg/[0.03] px-3 py-2.5 text-sm text-fg/70" title="Hanya bisa diubah lewat dial/menu/switch di badan kamera">
        <span aria-hidden="true">🔒</span>
        <span className="truncate">{state.value ?? "—"}</span>
        {name === "autopoweroff" && <span className="ml-auto shrink-0 text-[0.6875rem] text-fg/35">atur di menu kamera</span>}
        {state.group !== "power" && <span className="ml-auto shrink-0 text-[0.6875rem] text-fg/35">atur di kamera</span>}
      </div>
    );
  }
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} aria-label={labelOf(name, state)}>
      {state.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
    </select>
  );
}

function Labelled({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm text-fg/60">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[0.6875rem] leading-snug text-fg/35">{hint}</span>}
    </label>
  );
}

// Live control over the tethered camera. Works with every bridge that answers /properties:
// the native Canon/Sony bridge (EDSDK / Sony Camera Remote SDK) and electron/digicam-bridge.cjs.
// Only names a bridge reports are shown, so a camera that lacks (or locks) a setting just hides it.
export default function CameraPropertiesPanel({ bridgeUrl, enabled }: { bridgeUrl: string; enabled: boolean }) {
  const preset = useBoothConfig((s) => s.config.cameraPreset);
  const updateConfig = useBoothConfig((s) => s.update);
  const [properties, setProperties] = useState<CameraProperties | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [supported, setSupported] = useState(true);
  const [focusBusy, setFocusBusy] = useState(false);

  const load = async () => {
    if (!enabled || !bridgeUrl) return;
    setLoading(true);
    try {
      setProperties(await getCameraProperties(bridgeUrl));
      setSupported(true);
    } catch {
      setSupported(false);
      setProperties(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPending({});
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeUrl, enabled]);

  const entries = useMemo(() => Object.entries(properties ?? {}), [properties]);
  const valueOf = (name: string) => pending[name] ?? properties?.[name]?.value ?? "";

  if (!enabled || (!loading && !supported)) return null;

  const dirty = Object.keys(pending).length > 0;
  const modeLabel = properties?.exposuremode?.value ?? "";
  // Shutter/aperture are only free in manual-ish modes; warn instead of letting the camera silently refuse.
  const modeLocksTriangle = Boolean(modeLabel) && !/^(M\b|Manual)/i.test(modeLabel);

  const apply = async () => {
    if (!dirty) return;
    setApplying(true);
    try {
      const results = await setCameraProperties(bridgeUrl, pending);
      const failed = Object.entries(results).filter(([, r]) => !r.ok);
      if (failed.length > 0) {
        pushToast({ type: "error", title: "Sebagian pengaturan gagal diterapkan", sub: failed.map(([name, r]) => `${labelOf(name, properties?.[name])}: ${r.error}`).join(" · ") });
      } else {
        pushToast({ type: "success", title: "Pengaturan kamera diterapkan" });
      }
      setPending({});
      await load();
    } catch (error) {
      pushToast({ type: "error", title: "Gagal menerapkan pengaturan kamera", sub: error instanceof Error ? error.message : undefined });
    } finally {
      setApplying(false);
    }
  };

  // Everything the admin can set, at its current (or just-chosen) value — what the preset remembers.
  const savePreset = () => {
    const next: Record<string, string> = {};
    for (const [name, state] of entries) {
      if (!usable(state) || state.writable === false) continue;
      const value = valueOf(name);
      if (value) next[name] = value;
    }
    updateConfig({ cameraPreset: next });
    pushToast({ type: "success", title: "Preset kamera booth disimpan", sub: "Diterapkan otomatis setiap sesi foto dimulai" });
  };

  const clearPreset = () => {
    updateConfig({ cameraPreset: {} });
    pushToast({ type: "success", title: "Preset kamera dihapus" });
  };

  const runFocus = async (action: () => Promise<void>, failTitle: string) => {
    setFocusBusy(true);
    try {
      await action();
    } catch (error) {
      pushToast({ type: "error", title: failTitle, sub: error instanceof Error ? error.message : undefined });
    } finally {
      setFocusBusy(false);
    }
  };

  const presetKeys = Object.keys(preset ?? {});
  const known = new Set(GROUPS.map((g) => g.id));
  const otherEntries = entries.filter(([name, s]) => !TRIANGLE.some((t) => t.key === name) && !known.has(groupOf(name, s)) && usable(s));

  const renderField = (name: string, state: CameraPropertyState) => (
    <Labelled key={name} label={labelOf(name, state)}>
      <Select name={name} state={state} value={valueOf(name)} onChange={(v) => setPending((prev) => ({ ...prev, [name]: v }))} />
    </Labelled>
  );

  return (
    <>
      <section className={sectionClass}>
        <div className="flex items-center justify-between gap-3">
          <div><p className="eyebrow">TETHER CONTROL</p><h2 className="font-display text-xl font-semibold">Segitiga eksposur</h2></div>
          <button type="button" onClick={load} disabled={loading} className="rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/60 hover:text-fg disabled:opacity-50">
            {loading ? "Memuat…" : "Refresh"}
          </button>
        </div>
        {!properties ? (
          <p className="mt-4 text-xs text-fg/40">Memuat pengaturan kamera...</p>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-fg/10 bg-fg/[0.03] p-3">
              <TriangleGlyph />
              <p className="text-xs leading-relaxed text-fg/50">
                ISO, shutter, dan aperture saling mempengaruhi terang-gelapnya foto. Naikkan satu, turunkan yang lain untuk menjaga terang yang sama.
                {modeLabel && <> Mode kamera sekarang: <span className="font-semibold text-fg/80">{modeLabel}</span>.</>}
              </p>
            </div>
            {modeLocksTriangle && (
              <p className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                Kamera tidak di mode Manual (M), jadi shutter/aperture mungkin dikunci dan perubahan bisa ditolak. Putar dial mode ke M di badan kamera.
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {TRIANGLE.map(({ key, title, hint }) => {
                const state = properties[key];
                if (!state) return null;
                return (
                  <Labelled key={key} label={labelOf(key, state) || title} hint={usable(state) ? hint : undefined}>
                    {usable(state) ? <Select name={key} state={state} value={valueOf(key)} onChange={(v) => setPending((prev) => ({ ...prev, [key]: v }))} /> : <span className="mt-2 block text-xs text-fg/30">Tidak tersedia di kamera ini</span>}
                  </Labelled>
                );
              })}
            </div>
          </>
        )}
      </section>

      {properties && GROUPS.map((group) => {
        const rows = entries.filter(([name, s]) => !TRIANGLE.some((t) => t.key === name) && groupOf(name, s) === group.id && usable(s));
        const showFocusTools = group.id === "focus";
        const showPowerNote = group.id === "power";
        if (rows.length === 0 && !showFocusTools && !showPowerNote) return null;
        return (
          <section key={group.id} className={sectionClass}>
            <p className="eyebrow">{group.eyebrow}</p>
            <h2 className="font-display text-xl font-semibold">{group.title}</h2>
            {rows.length > 0 && <div className="mt-4 grid gap-4 sm:grid-cols-2">{rows.map(([name, s]) => renderField(name, s))}</div>}
            {showPowerNote && (
              <ul className="mt-4 space-y-1.5 text-xs leading-relaxed text-fg/45">
                <li>• <span className="text-fg/60">Live view hanya menyala selama sesi foto</span> dan mati sendiri di layar utama — ini yang paling mengurangi panas.</li>
                <li>• Saat pelanggan menyentuh layar mulai, kiosk membangunkan kamera dan menyalakan live view lebih dulu supaya siap saat sampai di layar foto.</li>
                <li>• Selama sesi, kiosk menahan kamera agar tidak tidur sendiri. Di luar sesi kamera mengikuti timer “Auto power off” di menunya.</li>
                <li>• Kamera yang sudah tidur atau mati tidak bisa dibangunkan dari PC (batasan Canon) — nyalakan atau setengah-tekan shutter, kiosk menyambung ulang otomatis.</li>
              </ul>
            )}
            {showFocusTools && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" disabled={focusBusy} onClick={() => runFocus(() => focusTetherCamera(bridgeUrl), "Tes autofocus gagal")} className="rounded-xl border border-fg/15 px-4 py-2 text-sm hover:bg-fg/5 disabled:opacity-50">
                  Tes autofocus
                </button>
                <span className="mx-1 hidden text-xs text-fg/30 sm:inline">atau fokus manual:</span>
                <button type="button" disabled={focusBusy} onClick={() => runFocus(() => driveTetherFocus(bridgeUrl, "near", 2), "Fokus manual gagal")} className="rounded-xl border border-fg/15 px-3 py-2 text-sm hover:bg-fg/5 disabled:opacity-50">◀ Lebih dekat</button>
                <button type="button" disabled={focusBusy} onClick={() => runFocus(() => driveTetherFocus(bridgeUrl, "far", 2), "Fokus manual gagal")} className="rounded-xl border border-fg/15 px-3 py-2 text-sm hover:bg-fg/5 disabled:opacity-50">Lebih jauh ▶</button>
                <span className="basis-full text-[0.6875rem] leading-snug text-fg/35">Lihat hasilnya di monitor live view. Fokus manual dari layar butuh live view menyala dan lensa di posisi AF (bridge native Canon); kamera lain: pakai ring fokus lensa.</span>
              </div>
            )}
          </section>
        );
      })}

      {properties && otherEntries.length > 0 && (
        <section className={sectionClass}>
          <p className="eyebrow">LAINNYA</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">{otherEntries.map(([name, s]) => renderField(name, s))}</div>
        </section>
      )}

      {properties && (
        <section className={sectionClass}>
          <p className="eyebrow">PRESET BOOTH</p>
          <h2 className="font-display text-xl font-semibold">Terapkan &amp; simpan</h2>
          <p className="mt-2 text-xs leading-relaxed text-fg/45">
            Pengaturan di atas langsung mengubah kamera fisik. Kamera biasanya lupa pengaturan ini saat dimatikan — simpan sebagai preset
            supaya kiosk menerapkannya lagi otomatis setiap sesi foto dimulai. Preset hanya berlaku untuk PC booth ini.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={apply} disabled={!dirty || applying} className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
              {applying && <Spinner size="sm" />}
              {applying ? "Menerapkan…" : "Terapkan ke kamera"}
            </button>
            <button type="button" onClick={savePreset} disabled={dirty || applying} title={dirty ? "Terapkan dulu perubahan ke kamera" : undefined} className="rounded-xl border border-fg/20 px-5 py-2.5 text-sm font-semibold hover:bg-fg/5 disabled:cursor-not-allowed disabled:opacity-40">
              Simpan sebagai preset booth
            </button>
            {presetKeys.length > 0 && (
              <button type="button" onClick={clearPreset} className="rounded-xl px-3 py-2.5 text-sm text-fg/50 hover:text-fg">Hapus preset</button>
            )}
          </div>
          {presetKeys.length > 0 ? (
            <p className="mt-3 text-xs text-fg/45">
              Preset tersimpan:{" "}
              {presetKeys.map((key) => `${FALLBACK_LABELS[key] ?? key} ${preset[key]}`).join(" · ")}
            </p>
          ) : (
            <p className="mt-3 text-xs text-fg/35">Belum ada preset tersimpan.</p>
          )}
        </section>
      )}
    </>
  );
}
