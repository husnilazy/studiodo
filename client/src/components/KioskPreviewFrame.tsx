import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBoothConfig, type BoothConfig } from "@/lib/boothConfigStore";
import {
  PREVIEW_CONFIG_MESSAGE,
  PREVIEW_MESSAGE,
  PREVIEW_PING_MESSAGE,
  PREVIEW_READY_MESSAGE,
  PREVIEW_ROUTE_MESSAGE,
  ROUTE_STAGE,
  type PreviewStage,
} from "@/lib/previewMode";

const STAGES: { id: PreviewStage; label: string }[] = [
  { id: "idle", label: "Layar awal" },
  { id: "packages", label: "Pilih paket" },
  { id: "orientation", label: "Tampilan kamera" },
  { id: "payment", label: "Pembayaran" },
  { id: "frame", label: "Pilih frame" },
  { id: "capture", label: "Sesi foto" },
  { id: "preview", label: "Edit foto" },
  { id: "result", label: "Hasil" },
];

type Orientation = "portrait" | "landscape";
const VIRTUAL: Record<Orientation, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
};

/**
 * The REAL kiosk, running live inside the admin page. It is the same app (same screens, fonts, buttons, animations) opened
 * in an iframe with `?kioskPreview=1`: write actions are answered with sample data, and the design being edited is pushed
 * in by postMessage the moment it changes. The frame is rendered at true kiosk resolution (1080×1920) and scaled to fit.
 */
export default function KioskPreviewFrame({ initialStage = "idle", focusStage, stickyTop = 24 }: { initialStage?: PreviewStage; /** When this changes, the frame jumps to that screen (e.g. the admin opened the "Layar awal" tab). */ focusStage?: PreviewStage; stickyTop?: number }) {
  const config = useBoothConfig((state) => state.config);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [stage, setStage] = useState<PreviewStage>(initialStage);
  const [ready, setReady] = useState(false);
  const [holderWidth, setHolderWidth] = useState(420);
  const [reloadKey, setReloadKey] = useState(0);
  const sentConfigRef = useRef<Partial<BoothConfig>>({});

  // Same file, opened in preview mode. (Electron loads it from disk, dev/web from the dev server — both work.)
  const src = useMemo(() => `${window.location.href.split("#")[0].split("?")[0]}?kioskPreview=1&r=${reloadKey}#/`, [reloadKey]);

  useEffect(() => {
    const element = holderRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setHolderWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const post = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  const goTo = useCallback((next: PreviewStage) => {
    setStage(next);
    post({ type: PREVIEW_MESSAGE, stage: next });
  }, [post]);

  // The frame boots, tells us it is ready; then it gets the design and the screen the admin was on.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: string; route?: string } | null;
      if (data?.type === PREVIEW_READY_MESSAGE) {
        sentConfigRef.current = {};
        setReady(true);
      } else if (data?.type === PREVIEW_ROUTE_MESSAGE && data.route) {
        const mapped = ROUTE_STAGE[data.route];
        if (mapped) setStage(mapped);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => { setReady(false); }, [reloadKey]);

  // Knock until the frame answers (it may have finished loading before this component started listening).
  useEffect(() => {
    if (ready) return;
    const timer = window.setInterval(() => post({ type: PREVIEW_PING_MESSAGE }), 400);
    return () => window.clearInterval(timer);
  }, [ready, reloadKey, post]);

  useEffect(() => {
    if (!focusStage) return;
    if (ready) goTo(focusStage);
    else setStage(focusStage);
    // react only to the requested screen changing, not to the frame becoming ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusStage]);

  // Push only the keys that changed since the last push (a logo/cover is a multi-MB data URL — never resend it per colour tweak).
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      const last = sentConfigRef.current as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(config)) {
        if (JSON.stringify(last[key]) !== JSON.stringify(value)) patch[key] = value;
      }
      if (Object.keys(patch).length === 0) return;
      sentConfigRef.current = { ...config };
      post({ type: PREVIEW_CONFIG_MESSAGE, config: patch });
    }, 90);
    return () => window.clearTimeout(timer);
  }, [config, ready, post]);

  useEffect(() => {
    if (ready && stage !== "idle") post({ type: PREVIEW_MESSAGE, stage });
    // only on (re)ready: later stage changes go through goTo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const virtual = VIRTUAL[orientation];
  const maxHeight = Math.max(360, Math.min(window.innerHeight - 250, 760));
  // 12px = the device bezel around the screen
  const scale = Math.max(0.05, Math.min((holderWidth - 12) / virtual.width, (maxHeight - 12) / virtual.height));
  const displayWidth = virtual.width * scale;
  const displayHeight = virtual.height * scale;

  return (
    <aside className="lg:sticky lg:self-start" style={{ top: stickyTop }}>
      <div className="overflow-hidden rounded-3xl border border-fg/10 bg-surface shadow-glass">
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-accent">Pratinjau langsung</p>
            <h2 className="font-display text-lg font-semibold leading-tight">Kiosk asli</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-fg/10 bg-fg/[0.04] p-0.5 text-xs font-semibold">
              {(["portrait", "landscape"] as const).map((value) => (
                <button key={value} type="button" onClick={() => setOrientation(value)} className={`rounded-md px-2.5 py-1 transition ${orientation === value ? "bg-surface text-fg shadow-sm" : "text-fg/50 hover:text-fg"}`}>
                  {value === "portrait" ? "Tegak" : "Lebar"}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)} title="Muat ulang pratinjau" className="flex h-8 w-8 items-center justify-center rounded-lg border border-fg/10 text-fg/55 transition hover:border-accent hover:text-accent">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5M20 12a8 8 0 0 1-13.66 5.66L4 15.5M20 4v4.5h-4.5M4 20v-4.5h4.5" /></svg>
            </button>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto px-4 pb-3">
          {STAGES.map((item) => (
            <button key={item.id} type="button" onClick={() => goTo(item.id)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${stage === item.id ? "border-accent bg-accent text-white" : "border-fg/10 text-fg/55 hover:border-fg/30 hover:text-fg"}`}>
              {item.label}
            </button>
          ))}
        </div>

        <div ref={holderRef} className="flex justify-center bg-fg/[0.05] px-3 py-4">
          <div className="relative shrink-0 rounded-[1.4rem] bg-[#10131c] p-[6px] shadow-2xl ring-1 ring-black/20" style={{ width: displayWidth + 12, height: displayHeight + 12 }}>
            <div className="relative overflow-hidden rounded-[1rem] bg-white" style={{ width: displayWidth, height: displayHeight }}>
              <iframe
                key={reloadKey}
                ref={iframeRef}
                src={src}
                title="Pratinjau kiosk"
                allow="camera"
                className="absolute left-0 top-0 border-0"
                style={{ width: virtual.width, height: virtual.height, transform: `scale(${scale})`, transformOrigin: "top left" }}
              />
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center bg-surface">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-fg/15 border-t-accent" />
                </div>
              )}
            </div>
          </div>
        </div>
        <p className="px-4 pb-4 text-xs leading-relaxed text-fg/45">
          Ini kiosk yang sebenarnya — ketuk layar di atas untuk mencoba alurnya. Pembayaran dan upload hanya contoh, tidak ada sesi nyata yang dibuat.
        </p>
      </div>
    </aside>
  );
}
