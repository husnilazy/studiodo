import { useEffect, useState } from "react";
import { useBoothConfig, type BoothConfig } from "@/lib/boothConfigStore";
import { checkTetherBridge, type TetherBridgeHealth } from "@/lib/camera";
import { inputClass, sectionClass } from "@/lib/adminUi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";

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
      <span className="text-sm text-white/60">{label}</span>
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
    refresh();
    return () => {
      controller.abort();
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
        {enabled && imageUrl ? <img src={imageUrl} alt="Live view kamera" className="h-full w-full object-contain" /> : <p className="px-5 text-center text-xs text-white/35">Aktifkan mode tether dan pastikan bridge kamera terhubung untuk melihat live view.</p>}
      </div>
      <p className="mt-3 text-xs text-white/40">Preview ini hanya memantau kamera. Pengambilan foto tetap dilakukan dari sesi kiosk.</p>
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
            <span className="text-sm text-white/70">Suara beep countdown</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={draft.autoCaptureEnabled} onChange={(e) => set("autoCaptureEnabled", e.target.checked)} />
            <span className="text-sm text-white/70">Jepret otomatis (kiosk lanjut sendiri ke foto berikutnya, tanpa perlu customer menekan tombol tiap kali)</span>
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
                <button type="button" onClick={checkBridgeNow} className="mt-1 shrink-0 rounded-lg border border-white/15 px-3 text-xs text-white/60 hover:text-white">
                  {bridgeChecking ? "Cek..." : "Cek koneksi"}
                </button>
              </div>
              <p className="mt-2 text-xs">
                {bridgeHealth === null ? (
                  <span className="text-white/40">Bridge default: electron/digicam-bridge.cjs di port 5510, meneruskan ke digiCamControl (port 5513). Pastikan digiCamControl sudah berjalan dengan webserver aktif.</span>
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
            <button type="button" onClick={cancel} className="text-sm text-white/50 hover:text-white">
              Batalkan perubahan
            </button>
          )}
        </div>
      </section>

      <AdminLiveView bridgeUrl={config.tetherBridgeUrl} enabled={config.cameraMode === "tether" && Boolean(bridgeHealth?.ok && bridgeHealth.digicamReachable)} />
    </div>
  );
}
