import { useEffect, useState } from "react";
import { useBoothConfig, type BoothConfig } from "@/lib/boothConfigStore";
import { checkTetherBridge, detectTetherCameras, startTetherLiveView, stopTetherLiveView, type DetectedCamera, type TetherBridgeHealth } from "@/lib/camera";
import CameraPropertiesPanel from "@/components/CameraPropertiesPanel";
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
  const [camTab, setCamTab] = useState<"setup" | "exposure">("setup");

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

  // Auto-detect: look for connected cameras on this PC. If the saved bridge has no
  // camera but another one does, switch to it automatically.
  const [detected, setDetected] = useState<DetectedCamera[]>([]);
  const [detecting, setDetecting] = useState(false);
  const detectNow = async (autoPick: boolean) => {
    setDetecting(true);
    const found = await detectTetherCameras();
    setDetected(found);
    setDetecting(false);
    if (autoPick && found.length > 0 && !found.some((camera) => camera.url === config.tetherBridgeUrl)) {
      const pick = found[0];
      set("cameraMode", "tether");
      set("tetherBridgeUrl", pick.url);
      update({ cameraMode: "tether", tetherBridgeUrl: pick.url });
      pushToast({ type: "success", title: "Kamera terdeteksi", sub: pick.name });
    }
  };
  useEffect(() => {
    void detectNow(true);
    const interval = setInterval(() => void detectNow(false), 6000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const chooseCamera = (camera: DetectedCamera) => {
    set("cameraMode", "tether");
    set("tetherBridgeUrl", camera.url);
    update({ cameraMode: "tether", tetherBridgeUrl: camera.url });
    pushToast({ type: "success", title: "Kamera dipilih", sub: camera.name });
  };

  const tetherReady = config.cameraMode === "tether" && Boolean(bridgeHealth?.ok && bridgeHealth.digicamReachable && bridgeHealth.cameraConnected !== false);
  const camTabs = [{ id: "setup", label: "Kamera & Sesi" }, { id: "exposure", label: "Eksposur & Live view" }] as const;

  return (
    <div className="flex flex-col items-stretch gap-4">
      <nav className="flex gap-1 self-start rounded-full border border-fg/10 bg-fg/[0.05] p-1" aria-label="Pengaturan kamera">
        {camTabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setCamTab(t.id)} className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${camTab === t.id ? "bg-fg text-canvas shadow-md" : "text-fg/55 hover:text-fg"}`}>{t.label}</button>
        ))}
      </nav>
      {camTab === "setup" && (
      <div className="grid items-start gap-5 xl:grid-cols-2">
      <section className={sectionClass}>
        <div className="flex items-center justify-between gap-3">
          <div><p className="eyebrow">KAMERA TERSAMBUNG</p><h2 className="font-display text-xl font-semibold">Pilih kamera</h2></div>
          <button type="button" onClick={() => void detectNow(true)} className="rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/60 hover:text-fg">{detecting ? "Mencari..." : "Cari kamera"}</button>
        </div>
        {detected.length === 0 ? (
          <p className="mt-3 text-sm text-fg/50">Belum ada kamera terdeteksi. Sambungkan kamera lewat USB, nyalakan, dan tutup EOS Utility / Imaging Edge. Pencarian diulang otomatis tiap beberapa detik; webcam tetap bisa dipakai lewat Mode kamera = Webcam.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {detected.map((camera) => {
              const active = camera.url === config.tetherBridgeUrl && config.cameraMode === "tether";
              return (
                <li key={camera.url} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3">
                  <div><p className="text-sm font-semibold">{camera.name}</p><p className="text-xs text-fg/40">{camera.url}</p></div>
                  {active ? <span className="rounded-full border border-emerald-300/30 px-2 py-1 text-[0.625rem] text-emerald-200">DIPAKAI</span> : <button type="button" onClick={() => chooseCamera(camera)} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold">Pakai</button>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
                  <span className="text-fg/40">Bridge default: electron/digicam-bridge.cjs di port 5510, meneruskan ke digiCamControl (port 5513). Pastikan digiCamControl sudah berjalan dengan webserver aktif. Bridge native Canon/Sony (tanpa digiCamControl, otomatis jalan bila terpasang): http://127.0.0.1:5514 — tutup EOS Utility/digiCamControl dulu.</span>
                ) : bridgeHealth.ok && bridgeHealth.engine && bridgeHealth.state === "asleep" ? (
                  <span className="text-amber-300">● Kamera tidur atau mati. Nyalakan kamera atau setengah-tekan shutter — bridge akan menyambung ulang otomatis.</span>
                ) : bridgeHealth.ok && bridgeHealth.engine && bridgeHealth.cameraConnected === false ? (
                  <span className="text-amber-300">● Bridge native aktif, tapi belum ada kamera Canon/Sony yang terdeteksi.{bridgeHealth.error ? ` ${bridgeHealth.error}.` : ""} Periksa kabel USB, nyalakan kamera, dan tutup EOS Utility / Imaging Edge.</span>
                ) : bridgeHealth.ok && bridgeHealth.engine ? (
                  <span className="text-emerald-300">● Bridge native aktif — {bridgeHealth.camera || "kamera"} terhubung ({bridgeHealth.engine === "sony" ? "Sony" : "Canon"} SDK)</span>
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

      <section className={`${sectionClass} xl:col-span-2`}>
        <p className="eyebrow">PANDUAN</p>
        <h2 className="font-display text-xl font-semibold">Kamera yang bisa dipakai &amp; cara menyambungkan</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { name: "Webcam / virtual camera", badge: "Paling mudah", steps: ["Colok webcam (atau nyalakan virtual camera seperti OBS / Camo / Iriun).", "Mode kamera = Webcam / virtual camera, lalu Simpan.", "Izinkan akses kamera bila diminta. Kualitas mengikuti webcam."] },
            { name: "Canon DSLR / mirrorless via digiCamControl", badge: "Tether", steps: ["Pasang & buka digiCamControl, aktifkan webserver (File > Settings > Webserver).", "Sambungkan kamera lewat USB, nyalakan, mode M. Tutup EOS Utility.", "Mode kamera = Canon DSLR / tether bridge, URL http://127.0.0.1:5510, klik Cek koneksi."] },
            { name: "Canon & Sony via bridge native", badge: "Tanpa digiCamControl", steps: ["Sambungkan kamera lewat USB dan nyalakan. Tutup EOS Utility / Imaging Edge / digiCamControl.", "Bridge native jalan otomatis di http://127.0.0.1:5514 bila terpasang.", "Mode kamera = tether, URL bridge 5514, klik Cek koneksi. Kamera juga muncul di daftar Pilih kamera."] },
            { name: "Nikon", badge: "Belum tersedia", steps: ["Belum ada bridge Nikon di aplikasi ini.", "Sementara pakai Webcam / virtual camera, atau Nikon Webcam Utility sebagai virtual camera."] },
          ].map((cam) => (
            <details key={cam.name} className="group rounded-2xl border border-fg/10 bg-fg/[0.03] p-4" open={cam.badge === "Paling mudah"}>
              <summary className="cursor-pointer list-none">
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">{cam.badge}</span>
                <p className="mt-2 text-sm font-semibold">{cam.name}</p>
              </summary>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-fg/60">
                {cam.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </details>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-fg/60">
          <p className="font-semibold text-amber-600">Kalau kamera tidak terdeteksi</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>Pakai kabel USB data (bukan kabel charger saja) dan colok langsung ke port PC, bukan hub.</li>
            <li>Hanya satu aplikasi yang boleh memakai kamera: tutup EOS Utility, Imaging Edge, atau digiCamControl yang tidak dipakai.</li>
            <li>Matikan mode sleep / auto power-off kamera, lalu klik "Cari kamera" atau "Cek koneksi".</li>
            <li>Atur eksposur dan lihat hasilnya langsung di tab "Eksposur &amp; Live view".</li>
          </ul>
        </div>
      </section>
      </div>
      )}
      {camTab === "exposure" && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <CameraPropertiesPanel bridgeUrl={config.tetherBridgeUrl} enabled={tetherReady} />
          <div className="xl:sticky xl:top-0 xl:only:col-span-full"><AdminLiveView bridgeUrl={config.tetherBridgeUrl} enabled={tetherReady} /></div>
        </div>
      )}
    </div>
  );
}
