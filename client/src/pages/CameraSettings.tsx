import { useEffect, useState } from "react";
import { useBoothConfig, type BoothConfig } from "@/lib/boothConfigStore";
import { checkTetherBridge, getCameraProperties, setCameraProperties, startTetherLiveView, stopTetherLiveView, type TetherBridgeHealth, type CameraProperties } from "@/lib/camera";
import { inputClass, sectionClass } from "@/lib/adminUi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";

const PROPERTY_LABELS: Record<string, string> = {
  iso: "ISO",
  shutterspeed: "Shutter Speed",
  aperture: "Aperture",
  whitebalance: "White Balance",
};

// ISO/shutter/aperture/WB control over the tethered camera — only works
// through electron/digicam-bridge.cjs (digiCamControl), verified live
// 2026-09-29 against a real Canon EOS 1300D via its "slc" single-command
// API (see the comment block at the top of digicam-bridge.cjs for the full
// verification notes — an earlier guess at the command syntax silently did
// nothing, since every request to digiCamControl's "/" returns the same
// static HTML whether or not the command was actually recognized). The
// separate closed-source canon-bridge.exe doesn't implement /properties at
// all, so this just fails to load and hides itself for that setup instead
// of showing a broken/empty panel.
function CameraPropertiesPanel({ bridgeUrl, enabled }: { bridgeUrl: string; enabled: boolean }) {
  const [properties, setProperties] = useState<CameraProperties | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [supported, setSupported] = useState(true);

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

  if (!enabled || (!loading && !supported)) return null;

  const dirty = Object.keys(pending).length > 0;

  const apply = async () => {
    if (!dirty) return;
    setApplying(true);
    try {
      const results = await setCameraProperties(bridgeUrl, pending);
      const failed = Object.entries(results).filter(([, r]) => !r.ok);
      if (failed.length > 0) {
        pushToast({ type: "error", title: "Sebagian pengaturan gagal diterapkan", sub: failed.map(([name, r]) => `${PROPERTY_LABELS[name] ?? name}: ${r.error}`).join(" · ") });
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

  return (
    <section className={sectionClass}>
      <div className="flex items-center justify-between gap-3">
        <div><p className="eyebrow">TETHER CONTROL</p><h2 className="font-display text-xl font-semibold">Pengaturan kamera</h2></div>
        <button type="button" onClick={load} disabled={loading} className="rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/60 hover:text-fg disabled:opacity-50">
          {loading ? "Memuat…" : "Refresh"}
        </button>
      </div>
      {!properties ? (
        <p className="mt-4 text-xs text-fg/40">Memuat pengaturan kamera...</p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {Object.entries(properties).map(([name, state]) => (
            <Field key={name} label={PROPERTY_LABELS[name] ?? name}>
              {state.error || state.choices.length === 0 ? (
                <p className="mt-2 text-xs text-fg/30">Tidak tersedia di kamera ini</p>
              ) : (
                <select
                  className={inputClass}
                  value={pending[name] ?? state.value ?? ""}
                  onChange={(e) => setPending((prev) => ({ ...prev, [name]: e.target.value }))}
                >
                  {state.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                </select>
              )}
            </Field>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-fg/40">Langsung mengubah kamera fisik yang terhubung — bukan preset, ini kontrol langsung ke hardware.</p>
      <div className="mt-4">
        <button
          type="button"
          onClick={apply}
          disabled={!dirty || applying}
          className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {applying && <Spinner size="sm" />}
          {applying ? "Menerapkan…" : "Terapkan ke kamera"}
        </button>
      </div>
    </section>
  );
}

type CameraDraft = Pick<BoothConfig, "countdownSeconds" | "captureVibe" | "beepEnabled" | "autoCaptureEnabled" | "cameraMode" | "tetherBridgeUrl">;
const pickDraft = (config: BoothConfig): CameraDraft => ({
  countdownSeconds: config.countdownSeconds,
  captureVibe: config.captureVibe,
  beepEnabled: config.beepEnabled,
  autoCaptureEnabled: config.autoCaptureEnabled,
  cameraMode: config.cameraMode,
  tetherBridgeUrl: config.tetherBridgeUrl,
});

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm text-fg/60">{label}</span>
      {children}
    </label>
  );
}

function AdminLiveView({ bridgeUrl, enabled }: { bridgeUrl: string; enabled: boolean }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !bridgeUrl) {
      setImageUrl(null);
      return;
    }
    const controller = new AbortController();
    let currentUrl: string | null = null;
    const refresh = async () => {
      while (!controller.signal.aborted) {
        try {
          const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/liveview.jpg?ts=${Date.now()}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error(`Live view status ${response.status}`);
          const nextUrl = URL.createObjectURL(await response.blob());
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          currentUrl = nextUrl;
          setImageUrl(nextUrl);
        } catch (error) {
          if (!controller.signal.aborted) console.error("Live view admin gagal diperbarui", error);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    };
    // Live view is off by default now — switch it on while this monitor is
    // open, and off again when it closes so the camera can cool down.
    startTetherLiveView(bridgeUrl).then(() => {
      if (!controller.signal.aborted) refresh();
    });
    return () => {
      controller.abort();
      stopTetherLiveView(bridgeUrl);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      setImageUrl(null);
    };
  }, [bridgeUrl, enabled]);

  return (
    <section className={sectionClass}>
      <div className="flex items-center justify-between gap-3">
        <div><p className="eyebrow">CAMERA MONITOR</p><h2 className="font-display text-xl font-semibold">Live view</h2></div>
        {enabled && <span className="rounded-full border border-emerald-300/30 px-2 py-1 text-[0.625rem] text-emerald-200">LIVE</span>}
      </div>
      <div className="mt-4 flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/50">
        {enabled && imageUrl ? <img src={imageUrl} alt="Live view kamera" className="h-full w-full object-contain" /> : <p className="px-5 text-center text-xs text-fg/35">Aktifkan mode tether dan pastikan bridge kamera terhubung untuk melihat live view.</p>}
      </div>
      <p className="mt-3 text-xs text-fg/40">Preview ini hanya memantau kamera. Pengambilan foto tetap dilakukan dari sesi kiosk.</p>
    </section>
  );
}

// Separated out of DeviceSettings.tsx (Fase 11) — "Kiosk" was one long page
// (API key table + camera + printer, all stacked) that needed a lot of
// scrolling to reach anything below the pairing table. Now its own sub-tab.
export default function CameraSettings() {
  const { config, update } = useBoothConfig();
  const [draft, setDraft] = useState<CameraDraft>(() => pickDraft(config));
  const set = <K extends keyof CameraDraft>(key: K, value: CameraDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const dirty = (Object.keys(draft) as (keyof CameraDraft)[]).some((key) => draft[key] !== config[key]);
  const [saving, setSaving] = useState(false);

  const save = () => {
    setSaving(true);
    update(draft);
    pushToast({ type: "success", title: "Pengaturan kamera tersimpan" });
    setSaving(false);
  };
  const cancel = () => setDraft(pickDraft(config));

  const [bridgeHealth, setBridgeHealth] = useState<TetherBridgeHealth | null>(null);
  const [bridgeChecking, setBridgeChecking] = useState(false);

  // Tests the DRAFT's url/mode — not yet-saved — so the admin can validate a
  // pending change before committing it with Simpan.
  const checkBridgeNow = async () => {
    if (draft.cameraMode !== "tether" || !draft.tetherBridgeUrl) {
      setBridgeHealth(null);
      return;
    }
    setBridgeChecking(true);
    const result = await checkTetherBridge(draft.tetherBridgeUrl);
    setBridgeHealth(result);
    setBridgeChecking(false);
  };
  useEffect(() => {
    checkBridgeNow();
    if (draft.cameraMode !== "tether" || !draft.tetherBridgeUrl) return;
    const interval = setInterval(checkBridgeNow, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.cameraMode, draft.tetherBridgeUrl]);

  return (
    <div className="flex flex-col items-stretch gap-5">
      <section className={sectionClass}>
        <h2 className="font-display text-xl font-semibold">Sesi Foto & Kamera</h2>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Countdown (detik)">
              <input type="number" min={1} max={15} className={inputClass} value={draft.countdownSeconds} onChange={(e) => set("countdownSeconds", Math.max(1, Number(e.target.value)))} />
            </Field>
            <Field label="Capture vibe">
              <select className={inputClass} value={draft.captureVibe} onChange={(e) => set("captureVibe", e.target.value as BoothConfig["captureVibe"])}>
                {["Electric", "Cotton Candy", "Ocean", "Sunset", "Mono"].map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={draft.beepEnabled} onChange={(e) => set("beepEnabled", e.target.checked)} />
            <span className="text-sm text-fg/70">Suara beep countdown</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={draft.autoCaptureEnabled} onChange={(e) => set("autoCaptureEnabled", e.target.checked)} />
            <span className="text-sm text-fg/70">Jepret otomatis (kiosk lanjut sendiri ke foto berikutnya, tanpa perlu customer menekan tombol tiap kali)</span>
          </label>
          <Field label="Mode kamera">
            <select className={inputClass} value={draft.cameraMode} onChange={(e) => set("cameraMode", e.target.value as BoothConfig["cameraMode"])}>
              <option value="webcam">Webcam / virtual camera</option>
              <option value="tether">Canon DSLR / tether bridge</option>
            </select>
          </Field>
          {draft.cameraMode === "tether" && (
            <Field label="URL tether bridge">
              <div className="flex gap-2">
                <input className={`${inputClass} flex-1`} value={draft.tetherBridgeUrl} onChange={(e) => set("tetherBridgeUrl", e.target.value)} placeholder="http://127.0.0.1:5510" />
                <button type="button" onClick={checkBridgeNow} className="mt-1 shrink-0 rounded-lg border border-fg/15 px-3 text-xs text-fg/60 hover:text-fg">
                  {bridgeChecking ? "Cek..." : "Cek koneksi"}
                </button>
              </div>
              <p className="mt-2 text-xs">
                {bridgeHealth === null ? (
                  <span className="text-fg/40">Bridge default: electron/digicam-bridge.cjs di port 5510, meneruskan ke digiCamControl (port 5513). Pastikan digiCamControl sudah berjalan dengan webserver aktif.</span>
                ) : bridgeHealth.ok && bridgeHealth.digicamReachable && bridgeHealth.cameraConnected === false ? (
                  <span className="text-amber-300">● digiCamControl jalan, tapi kamera Canon tidak terdeteksi. Periksa kabel USB dan pastikan kamera menyala.</span>
                ) : bridgeHealth.ok && bridgeHealth.digicamReachable ? (
                  <span className="text-emerald-300">● Bridge aktif, digiCamControl terhubung ({bridgeHealth.digicamUrl})</span>
                ) : bridgeHealth.ok ? (
                  <span className="text-amber-300">● Bridge aktif, tapi digiCamControl tidak terjangkau di {bridgeHealth.digicamUrl}. Pastikan digiCamControl sudah dibuka dan webserver-nya aktif (File &gt; Settings &gt; Webserver).</span>
                ) : (
                  <span className="text-red-300">● Bridge tidak terjangkau: {bridgeHealth.error}</span>
                )}
              </p>
            </Field>
          )}
        </div>
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving && <Spinner size="sm" />}
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
          {dirty && (
            <button type="button" onClick={cancel} className="text-sm text-fg/50 hover:text-fg">
              Batalkan perubahan
            </button>
          )}
        </div>
      </section>

      <CameraPropertiesPanel bridgeUrl={config.tetherBridgeUrl} enabled={config.cameraMode === "tether" && Boolean(bridgeHealth?.ok && bridgeHealth.digicamReachable && bridgeHealth.cameraConnected !== false)} />

      <AdminLiveView bridgeUrl={config.tetherBridgeUrl} enabled={config.cameraMode === "tether" && Boolean(bridgeHealth?.ok && bridgeHealth.digicamReachable && bridgeHealth.cameraConnected !== false)} />
    </div>
  );
}
