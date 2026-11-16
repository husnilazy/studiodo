import { useEffect, useRef, useState } from "react";
import type { BoothConfig, CameraMode, ExtraCamera, MultiCameraMode } from "@/lib/boothConfigStore";
import { checkTetherBridge, listWebcams, openWebcam, startTetherLiveView, stopTetherLiveView, type TetherBridgeHealth, type WebcamDevice } from "@/lib/camera";
import { inputClass, sectionClass } from "@/lib/adminUi";
import Select from "@/components/Select";

export type MultiCameraDraft = Pick<BoothConfig, "mainCameraName" | "mainCameraDeviceId" | "multiCameraMode" | "extraCameras" | "cameraMode" | "tetherBridgeUrl">;

const MODES: { value: MultiCameraMode; label: string; hint: string }[] = [
  { value: "off", label: "Satu kamera (biasa)", hint: "Hanya kamera utama dipakai, seperti sebelumnya." },
  { value: "alternate", label: "Bergantian per foto", hint: "Foto 1 dari kamera utama, foto 2 dari Sudut 2, foto 3 dari kamera utama, dan seterusnya." },
  { value: "dual", label: "Dua sudut tiap jepretan", hint: "Setiap jepretan mengambil dua foto sekaligus. Di layar Preview pelanggan bisa memilih sudut mana yang dipakai." },
];

/** Small on-demand preview. Off until the admin asks, because two programs rarely share one webcam/DSLR at the same time. */
function CameraPreview({ kind, deviceId, bridgeUrl }: { kind: CameraMode; deviceId?: string; bridgeUrl?: string }) {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!on) return;
    setError(null);
    let cancelled = false;
    if (kind === "webcam") {
      let stream: MediaStream | undefined;
      openWebcam(deviceId)
        .then((opened) => {
          if (cancelled) { opened.getTracks().forEach((t) => t.stop()); return; }
          stream = opened;
          if (videoRef.current) videoRef.current.srcObject = opened;
        })
        .catch(() => { if (!cancelled) setError("Webcam tidak bisa dibuka (dipakai program lain atau tidak ditemukan)."); });
      return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); };
    }
    const url = (bridgeUrl ?? "").replace(/\/$/, "");
    if (!url) { setError("Isi URL bridge dulu."); return; }
    let currentUrl: string | null = null;
    (async () => {
      const started = await startTetherLiveView(url);
      if (!started && !cancelled) setError("Live view kamera belum siap. Cek koneksi bridge.");
      while (!cancelled) {
        try {
          const response = await fetch(`${url}/liveview.jpg?ts=${Date.now()}`, { cache: "no-store" });
          if (response.ok) {
            const next = URL.createObjectURL(await response.blob());
            if (currentUrl) URL.revokeObjectURL(currentUrl);
            currentUrl = next;
            if (!cancelled) { setImageUrl(next); setError(null); }
          }
        } catch { /* keep polling; the bridge may still be warming up */ }
        await new Promise((resolve) => window.setTimeout(resolve, 600));
      }
    })();
    return () => { cancelled = true; stopTetherLiveView(url); if (currentUrl) URL.revokeObjectURL(currentUrl); setImageUrl(null); };
  }, [on, kind, deviceId, bridgeUrl]);

  return (
    <div className="w-full sm:w-44">
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-fg/10 bg-black/60">
        {on ? (
          kind === "webcam"
            ? <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            : imageUrl ? <img src={imageUrl} alt="Preview kamera" className="h-full w-full object-cover" /> : <span className="px-2 text-center text-[0.65rem] text-white/50">Menunggu live view…</span>
        ) : (
          <span className="px-2 text-center text-[0.65rem] text-white/40">Preview mati</span>
        )}
      </div>
      {error && on && <p className="mt-1 text-[0.65rem] text-amber-500">{error}</p>}
      <button type="button" onClick={() => setOn((v) => !v)} className="mt-1 w-full rounded-lg border border-fg/15 px-2 py-1 text-[0.7rem] text-fg/60 hover:text-fg">{on ? "Matikan preview" : "Lihat preview"}</button>
    </div>
  );
}

function WebcamSelect({ value, onChange, webcams, allowDefault }: { value: string; onChange: (value: string) => void; webcams: WebcamDevice[]; allowDefault?: boolean }) {
  return (
    <Select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowDefault && <option value="">Kamera default browser</option>}
      {!allowDefault && !value && <option value="">Pilih webcam…</option>}
      {webcams.map((cam) => <option key={cam.deviceId} value={cam.deviceId}>{cam.label}</option>)}
      {value && !webcams.some((cam) => cam.deviceId === value) && <option value={value}>(webcam tersimpan, tidak terdeteksi)</option>}
    </Select>
  );
}

export default function MultiCameraSettings({ draft, set }: { draft: MultiCameraDraft; set: <K extends keyof MultiCameraDraft>(key: K, value: MultiCameraDraft[K]) => void }) {
  const [webcams, setWebcams] = useState<WebcamDevice[]>([]);
  const [health, setHealth] = useState<Record<string, TetherBridgeHealth | undefined>>({});

  const refreshWebcams = () => { void listWebcams().then(setWebcams); };
  useEffect(() => {
    refreshWebcams();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshWebcams);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshWebcams);
  }, []);

  const extras = draft.extraCameras;
  const patchExtra = (id: string, patch: Partial<ExtraCamera>) => set("extraCameras", extras.map((cam) => (cam.id === id ? { ...cam, ...patch } : cam)));
  const addExtra = () => {
    const usedIds = new Set([draft.mainCameraDeviceId, ...extras.map((cam) => cam.deviceId)]);
    const free = webcams.find((cam) => !usedIds.has(cam.deviceId));
    set("extraCameras", [...extras, { id: `cam-${Date.now().toString(36)}`, name: `Sudut ${extras.length + 2}`, kind: "webcam", deviceId: free?.deviceId ?? "", bridgeUrl: "http://127.0.0.1:5514", enabled: true }]);
  };
  const firstEnabledId = extras.find((cam) => cam.enabled)?.id;

  const checkExtra = async (cam: ExtraCamera) => {
    const result = await checkTetherBridge(cam.bridgeUrl ?? "");
    setHealth((current) => ({ ...current, [cam.id]: result }));
  };

  const sameBridge = (cam: ExtraCamera) => draft.cameraMode === "tether" && cam.kind === "tether" && (cam.bridgeUrl ?? "").replace(/\/$/, "") === draft.tetherBridgeUrl.replace(/\/$/, "");

  return (
    <section className={`${sectionClass} xl:col-span-2`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="eyebrow">MULTI KAMERA</p><h2 className="font-display text-xl font-semibold">Kamera & sudut foto</h2></div>
        <button type="button" onClick={refreshWebcams} className="rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/60 hover:text-fg">Cari webcam ({webcams.length})</button>
      </div>

      <label className="mt-4 block">
        <span className="text-sm text-fg/60">Mode pengambilan foto</span>
        <Select className={inputClass} value={draft.multiCameraMode} onChange={(e) => set("multiCameraMode", e.target.value as MultiCameraMode)}>
          {MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
        </Select>
        <p className="mt-1 text-xs text-fg/45">{MODES.find((mode) => mode.value === draft.multiCameraMode)?.hint}</p>
      </label>
      {draft.multiCameraMode !== "off" && !firstEnabledId && <p className="mt-2 text-xs text-amber-500">Belum ada kamera Sudut 2 yang aktif, jadi kiosk tetap memakai satu kamera.</p>}

      <div className="mt-4 space-y-3">
        <div className="flex flex-col gap-3 rounded-2xl border border-fg/10 p-4 sm:flex-row">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold">Kamera utama <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[0.6rem] font-bold uppercase text-accent">Utama</span></p>
            <label className="block"><span className="text-xs text-fg/55">Nama</span>
              <input className={inputClass} value={draft.mainCameraName} onChange={(e) => set("mainCameraName", e.target.value)} placeholder="Kamera utama" />
            </label>
            {draft.cameraMode === "webcam" ? (
              <label className="block"><span className="text-xs text-fg/55">Webcam</span>
                <WebcamSelect value={draft.mainCameraDeviceId} onChange={(value) => set("mainCameraDeviceId", value)} webcams={webcams} allowDefault />
              </label>
            ) : <p className="text-xs text-fg/45">Memakai kamera tether ({draft.tetherBridgeUrl}). Diatur di bagian "Sesi Foto & Kamera".</p>}
          </div>
          <CameraPreview kind={draft.cameraMode} deviceId={draft.mainCameraDeviceId || undefined} bridgeUrl={draft.tetherBridgeUrl} />
        </div>

        {extras.map((cam) => {
          const h = health[cam.id];
          return (
            <div key={cam.id} className="flex flex-col gap-3 rounded-2xl border border-fg/10 p-4 sm:flex-row">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    Kamera tambahan
                    <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase ${cam.enabled && cam.id === firstEnabledId ? "bg-emerald-400/15 text-emerald-600" : "bg-fg/10 text-fg/45"}`}>
                      {cam.enabled ? (cam.id === firstEnabledId ? "Sudut 2" : "Belum dipakai") : "Nonaktif"}
                    </span>
                  </p>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-fg/60"><input type="checkbox" checked={cam.enabled} onChange={(e) => patchExtra(cam.id, { enabled: e.target.checked })} /> Aktif</label>
                    <button type="button" onClick={() => set("extraCameras", extras.filter((c) => c.id !== cam.id))} className="text-xs text-red-500 hover:underline">Hapus</button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block"><span className="text-xs text-fg/55">Nama</span>
                    <input className={inputClass} value={cam.name} onChange={(e) => patchExtra(cam.id, { name: e.target.value })} />
                  </label>
                  <label className="block"><span className="text-xs text-fg/55">Jenis</span>
                    <Select className={inputClass} value={cam.kind} onChange={(e) => patchExtra(cam.id, { kind: e.target.value as CameraMode })}>
                      <option value="webcam">Webcam / virtual camera</option>
                      <option value="tether">Kamera bridge (Canon/Sony/digiCamControl)</option>
                    </Select>
                  </label>
                </div>
                {cam.kind === "webcam" ? (
                  <label className="block"><span className="text-xs text-fg/55">Webcam</span>
                    <WebcamSelect value={cam.deviceId ?? ""} onChange={(value) => patchExtra(cam.id, { deviceId: value })} webcams={webcams} />
                    {cam.deviceId && cam.deviceId === draft.mainCameraDeviceId && <p className="mt-1 text-xs text-amber-500">Sama dengan kamera utama, pilih webcam lain agar sudutnya berbeda.</p>}
                  </label>
                ) : (
                  <label className="block"><span className="text-xs text-fg/55">URL bridge</span>
                    <div className="flex gap-2">
                      <input className={`${inputClass} flex-1`} value={cam.bridgeUrl ?? ""} onChange={(e) => patchExtra(cam.id, { bridgeUrl: e.target.value })} placeholder="http://127.0.0.1:5514" />
                      <button type="button" onClick={() => void checkExtra(cam)} className="mt-1 shrink-0 rounded-lg border border-fg/15 px-3 text-xs text-fg/60 hover:text-fg">Cek</button>
                    </div>
                    {sameBridge(cam) && <p className="mt-1 text-xs text-amber-500">URL ini sama dengan kamera utama: satu bridge hanya melayani satu kamera.</p>}
                    {h && <p className={`mt-1 text-xs ${h.ok && h.cameraConnected !== false ? "text-emerald-600" : "text-amber-500"}`}>{h.ok ? (h.cameraConnected === false ? "Bridge aktif, kamera belum terdeteksi." : `Bridge aktif${h.camera ? ` — ${h.camera}` : ""}`) : `Tidak terjangkau: ${h.error ?? ""}`}</p>}
                  </label>
                )}
              </div>
              <CameraPreview kind={cam.kind} deviceId={cam.deviceId || undefined} bridgeUrl={cam.bridgeUrl} />
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={addExtra} className="rounded-lg border border-fg/15 px-4 py-2 text-sm font-semibold text-fg/70 hover:text-fg">+ Tambah kamera</button>
        <p className="text-xs text-fg/45">Saat ini hanya kamera tambahan aktif yang pertama dipakai sebagai Sudut 2. Kalau kamera itu tidak terdeteksi saat sesi, kiosk otomatis memakai kamera utama saja.</p>
      </div>
      <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3 text-xs text-fg/60">Dua kamera bridge/DSLR sekaligus butuh dua bridge di port berbeda dan belum diuji di kamera sungguhan. Kombinasi paling aman: dua webcam, atau satu DSLR + satu webcam.</p>
    </section>
  );
}
