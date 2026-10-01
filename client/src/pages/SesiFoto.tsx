import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useKioskSession, FILTER_CSS, FILTER_LABELS, type CameraFilter } from "@/lib/sessionStore";
import { isEventActive, useBoothConfig } from "@/lib/boothConfigStore";
import { captureFromTether, focusTetherCamera, checkTetherBridge, startTetherLiveView, stopTetherLiveView } from "@/lib/camera";
import { renderTemplate } from "@/lib/output";
import { getNextRoute } from "@/lib/kioskFlow";
import { useTemplateLibrary } from "@/lib/templateStore";
import { addPendingPhoto, isBrowserOnline, isOfflineSessionId } from "@/lib/offlineStore";
import { encodeGif, type GifFrame } from "@/lib/gifEncoder";
import { prepareClipFrameStyle, drawClipFrame, pickClipCanvasSize } from "@/lib/clipFrame";
import { ScreenLayoutBoundary } from "@/lib/screenBuilder/ScreenLayoutBoundary";
import { usePositionableContext } from "@/lib/screenBuilder/PositionableContext";
import Positionable from "@/components/Positionable";
import Spinner from "@/components/Spinner";
import StepProgress from "@/components/kiosk/StepProgress";
import { Icon } from "@/components/kiosk/Icons";

// Sony Imaging Edge Webcam / virtual cam warm-up guard
const CAMERA_WARMUP_MS = 2800;
const FILTER_ORDER: CameraFilter[] = ["normal", "bw", "warm", "cool", "vintage", "fade", "vivid"];

// Each photo shot also captures a short clip of that moment (a "living
// photo") — GIF compression doesn't scale past a couple of seconds anyway
// (huge file, slow to encode), and a brief loop is what "GIF" means
// everywhere else (messaging apps, social media).
// These were pushed higher once (2500ms/720px/1080p) chasing a "kualitas
// jelek" complaint, but real kiosk hardware testing then showed the combined
// GIF/video going blank on the result screen — most likely the heavier
// composite (more, bigger frames quantized/encoded synchronously right after
// the session) either failing or taking too long on modest kiosk hardware,
// not a display bug. Settled back to a more modest bump — still clearly
// better than the original 1600ms/480px/720p, but far less likely to choke a
// weak CPU right when it matters. See [[gif-video-quality-and-blank-preview-fix]].
const SLOT_CLIP_DURATION_MS = 2000;
const SLOT_CLIP_GIF_FRAME_INTERVAL_MS = 120; // ~8fps — smooth enough for a loop, keeps file size/encode time small
const GIF_MAX_WIDTH = 560;
// MediaRecorder has no sane default bitrate — leaving it unset produced the
// muddy, blocky "kualitas jelek" complaint regardless of resolution. This is
// a near-free quality win (barely affects encode cost) unlike raising
// resolution/fps, so it stays even after the rest got dialed back.
const SLOT_VIDEO_BITRATE = 6_000_000;

function IconRefreshSmall({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5M20 12a8 8 0 0 1-13.66 5.66L4 15.5M20 4v4.5h-4.5M4 20v-4.5h4.5" />
    </svg>
  );
}
function IconCameraSmall({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

/** Overlay yang muncul begitu timer sesi habis.
 *  Auto-redirect ke /preview setelah 3 detik — tapi ditahan selama GIF/video
 *  gabungan masih disimpan, supaya customer tidak lompat ke halaman hasil
 *  sebelum medianya jadi (itu yang sebelumnya bikin preview di Hasil.tsx
 *  kadang blank: combine belum selesai tapi timer sudah memaksa pindah halaman). */
function TimerExpiredOverlay({ onSkip, waitingForMedia }: { onSkip: () => void; waitingForMedia: boolean }) {
  const [countdown, setCountdown] = useState(3);
  useEffect(() => {
    if (waitingForMedia) return;
    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(interval);
          onSkip();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onSkip, waitingForMedia]);
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/75 backdrop-blur-sm">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20 ring-1 ring-red-400/40">
        {waitingForMedia ? <Spinner size="md" /> : <span className="font-display text-3xl font-bold text-red-300">{countdown}</span>}
      </div>
      <div className="text-center">
        <p className="font-display text-2xl font-semibold text-fg">Waktu sesi habis</p>
        <p className="mt-1 text-fg/50">
          {waitingForMedia ? "Menyimpan GIF & video sesi..." : `Melanjutkan ke preview dalam ${countdown} detik...`}
        </p>
      </div>
      <button
        className="pointer-events-auto k-btn k-btn-accent k-btn-lg disabled:cursor-wait disabled:opacity-50"
        onClick={onSkip}
        disabled={waitingForMedia}
      >
        Lanjut sekarang →
      </button>
    </div>
  );
}

export default function SesiFoto() {
  const [, navigate] = useLocation();
  const config = useBoothConfig((s) => s.config);
  const eventActive = isEventActive(config);
  const eventTimerEnabled = !eventActive || config.eventTimerEnabled;
  const sessionTimerMinutes = eventActive ? config.eventSessionTimerMinutes : config.sessionTimerMinutes;
  const {
    sessionId,
    selectedPackage,
    orientation,
      mirrorLiveView,
    filter,
    setFilter,
    photoUrls,
    selectedTemplateId,
    selectedTemplateData,
    templatePhotoMap,
    setPhotoAtSlot,
    currentSlot,
    setCurrentSlot,
    sessionStartedAt,
    beginSessionTimer,
    setMediaUrl,
    setSlotClipUrl,
  } = useKioskSession();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Per-slot clip storage — index matches photoUrls/currentSlot. GIF frames
  // are kept as raw pixel data (needed to recomposite at combine time);
  // video clips are kept as their already-encoded blob (recomposited by
  // playing them back through hidden <video> elements instead).
  const slotGifFramesRef = useRef<(GifFrame[] | null)[]>([]);
  const slotVideoBlobsRef = useRef<(Blob | null)[]>([]);
  const captureLockRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  // Which slots still have a photo upload in flight in the background —
  // purely an informational badge on the thumbnail, never blocks the shutter.
  const [syncingSlots, setSyncingSlots] = useState<Set<number>>(new Set());
  const [mediaUploading, setMediaUploading] = useState(false);
  const [finishingEarly, setFinishingEarly] = useState(false);
  // Persistent: camera/bridge genuinely unreachable — blocks the shutter and
  // shows the full "kamera belum tersedia" overlay.
  const [cameraError, setCameraError] = useState<string | null>(null);
  // Transient: a single capture/focus/upload attempt failed even though the
  // camera itself is fine — shown as a small dismissing note, never blocks
  // the view with wrong ("allow camera in your browser") wording for a Canon.
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const showCaptureNotice = (message: string) => {
    setCaptureNotice(message);
    window.setTimeout(() => setCaptureNotice((current) => (current === message ? null : current)), 5000);
  };
  const [focusing, setFocusing] = useState(false);
  const [capturedSlot, setCapturedSlot] = useState<number | null>(null);
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const [liveViewLost, setLiveViewLost] = useState(false);
  const [liveViewStarting, setLiveViewStarting] = useState(false);
  // The live preview box's shape matches whatever the camera actually streams
  // (read off the feed itself) instead of a hardcoded 4:3/3:4 guess — a Canon's
  // live view is commonly 3:2 or 16:9, not 4:3, and forcing 4:3 on a feed that
  // isn't letterboxes or crops it visibly. Until the first real frame/metadata
  // arrives, it fills whatever space it's given (see the ResizeObserver effect
  // below) rather than guessing from the session's print orientation.
  const [liveAspect, setLiveAspect] = useState<number | null>(null);
  const lastMeasuredAspectRef = useRef<number | null>(null);
  // CSS aspect-ratio alone doesn't reliably fill a flex item here — the box
  // also needs an explicit height to actually grow to fill the column (a
  // flex parent with items-center doesn't stretch it), but an explicit
  // height makes aspect-ratio only solve for width, so width then just gets
  // clamped by max-width without height ever re-deriving from it — the box
  // ends up whatever shape the panel happens to be, exactly the original
  // bug. Measuring the panel and computing concrete pixel dimensions in JS
  // sidesteps that CSS sizing conflict entirely.
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);
  const reportLiveAspect = (width: number, height: number) => {
    if (!width || !height) return;
    const ratio = width / height;
    const last = lastMeasuredAspectRef.current;
    // Skip re-render on every frame in tether mode (the feed is polled as a
    // plain <img>, so onLoad fires per frame) — only update when the shape
    // actually changed meaningfully.
    if (last !== null && Math.abs(last - ratio) < 0.01) return;
    lastMeasuredAspectRef.current = ratio;
    setLiveAspect(ratio);
  };
  const [capturing, setCapturing] = useState(false);
  const liveViewFailStreakRef = useRef(0);
  const [remainingSeconds, setRemainingSeconds] = useState(eventTimerEnabled ? sessionTimerMinutes * 60 : 0);
  const storedTemplate = useTemplateLibrary((state) => state.templates.find((item) => item.id === selectedTemplateId));
  const template = selectedTemplateData ?? storedTemplate;
  const templateCanvasRef = useRef<HTMLCanvasElement>(null);
  // This screen is the most state-heavy in the kiosk (webcam/tether polling,
  // countdown, recording) — when mounted inside the WYSIWYG editor, none of that
  // should actually run. Only the static header is made designable in Fase 5b;
  // everything else here stays completely untouched/unwrapped on purpose.
  const positionable = usePositionableContext();
  const isEditMode = Boolean(positionable?.editMode);

  // Persisted kiosk configs from older versions may not have the capture limit yet.
  const maxPhotosPerSession = Number.isFinite(config.maxPhotosPerSession) && config.maxPhotosPerSession > 0
    ? config.maxPhotosPerSession
    : 10;
  const eventMaxPhotos = eventActive && Number.isFinite(config.eventMaxPhotosPerSession) && config.eventMaxPhotosPerSession > 0
    ? config.eventMaxPhotosPerSession
    : Infinity;
  const packagePhotoCount = Number.isFinite(selectedPackage?.photoCount) && (selectedPackage?.photoCount ?? 0) > 0
    ? selectedPackage?.photoCount ?? 3
    : 3;
  const totalPhotos = Math.min(packagePhotoCount, maxPhotosPerSession, eventMaxPhotos);
  const capturedCount = photoUrls.filter(Boolean).length;
  const sessionComplete = capturedCount >= totalPhotos;
  // A chosen frame only has so many photo slots — once they're all filled,
  // shooting further photos (up to whatever the package quota allows) has
  // nowhere to go in that frame, so offer to move on early instead of
  // forcing the customer through unused shots.
  const templateSlotCount = template?.slots?.length ?? 0;
  const canFinishEarly = !sessionComplete && templateSlotCount > 0 && capturedCount >= templateSlotCount;
  // `cameraReady` alone (a bridge health-check / warmup timer) can flip true
  // before the preview box has ever measured the camera's real aspect ratio
  // (liveAspect) — the box then visibly resizes, from its "fill the whole
  // column" guess down to the camera's real (usually narrower) shape, the
  // moment the first real frame reports in. That resize landing right around
  // when the now-enabled shutter gets tapped is what looked like "tapping
  // the button moves it" — it wasn't the tap, it was this race. Requiring
  // liveAspect too means the box has already settled to its final size
  // before the shutter can ever be pressed.
  const previewReady = cameraReady && liveAspect !== null;

  useEffect(() => {
    if (isEditMode) return;
    if (!eventTimerEnabled) {
      setRemainingSeconds(0);
      return;
    }
    beginSessionTimer();
    const timer = window.setInterval(() => {
      const startedAt = useKioskSession.getState().sessionStartedAt;
      const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
      setRemainingSeconds(Math.max(0, sessionTimerMinutes * 60 - elapsed));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [beginSessionTimer, eventTimerEnabled, sessionTimerMinutes]);

  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;
    const compute = () => {
      const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();
      if (!containerWidth || !containerHeight) return;
      // Before the camera's real feed shape is known (still connecting, or an
      // error like "Kamera belum tersedia"), fill the WHOLE available box
      // instead of guessing from the session's target print orientation — a
      // portrait 4R output doesn't mean the live viewfinder should be
      // portrait-shaped too, that just wastes the wide screen either side of
      // it. The final photo is cropped to the chosen orientation later, when
      // it's composited into the frame template; the viewfinder's only job
      // here is to use the space it's given and match the camera once known.
      const ratio = liveAspect ?? (containerWidth / containerHeight);
      let width = containerWidth;
      let height = width / ratio;
      if (height > containerHeight) {
        height = containerHeight;
        width = height * ratio;
      }
      setPreviewSize((prev) => (prev && Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5) ? prev : { width, height });
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [liveAspect]);

  useEffect(() => {
    if (isEditMode) return;
    if (!selectedPackage || !sessionId) {
      navigate("/paket");
      return;
    }
    if (config.cameraMode === "tether") return;
    let stream: MediaStream | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        // Warm-up delay for Sony Imaging Edge Webcam / other virtual cams
        setTimeout(() => setCameraReady(true), CAMERA_WARMUP_MS);
      } catch (err) {
        console.error("Gagal akses kamera", err);
        setCameraError("Kamera webcam tidak dapat diakses. Periksa izin kamera.");
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [config.cameraMode, selectedPackage, sessionId]);

  // Tether mode: don't just assume the Canon bridge/camera is reachable —
  // actually check, and keep checking, so a customer never pays and steps up
  // to a dead camera without anyone knowing until the shutter is pressed.
  useEffect(() => {
    if (isEditMode || !selectedPackage || !sessionId || config.cameraMode !== "tether") return;
    let cancelled = false;

    const check = async () => {
      const result = await checkTetherBridge(config.tetherBridgeUrl);
      if (cancelled) return;
      const ok = Boolean(result.ok && result.digicamReachable && result.cameraConnected !== false);
      setCameraReady(ok);
      setCameraError(ok
        ? null
        : (result.ok && result.digicamReachable
          ? "Kamera Canon tidak terdeteksi. Periksa kabel USB dan pastikan kamera menyala."
          : (result.digicamReachable === false
            ? "digiCamControl belum berjalan. Buka digiCamControl dan aktifkan webserver-nya."
            : "Bridge kamera tidak terjangkau. Pastikan digiCamControl dan bridge-nya berjalan.")));
    };

    check();
    const interval = window.setInterval(check, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [config.cameraMode, config.tetherBridgeUrl, selectedPackage, sessionId]);

  useEffect(() => {
    if (isEditMode || config.cameraMode !== "tether") return;
    const controller = new AbortController();
    const bridgeUrl = config.tetherBridgeUrl.replace(/\/$/, "");

    const refreshLiveView = async () => {
      // Live view is only switched on for the duration of a session (the
      // camera overheats if it streams all day) — ask the bridge to start it
      // and wait for the first frame before polling. A failed start isn't
      // fatal: polling below still picks up a feed that was already running.
      setLiveViewStarting(true);
      await startTetherLiveView(bridgeUrl);
      if (controller.signal.aborted) return;
      setLiveViewStarting(false);
      while (!controller.signal.aborted) {
        setLiveViewUrl(`${bridgeUrl}/liveview.jpg?ts=${Date.now()}`);
        // Back off once the feed is confirmed lost — no point hammering a
        // dead bridge/camera at 140ms while waiting for it to come back.
        const interval = liveViewFailStreakRef.current >= 8 ? 1000 : 140;
        await new Promise((resolve) => window.setTimeout(resolve, interval));
      }
    };

    refreshLiveView();
    return () => {
      controller.abort();
      setLiveViewUrl(null);
      setLiveViewStarting(false);
      stopTetherLiveView(bridgeUrl);
    };
  }, [config.cameraMode, config.tetherBridgeUrl]);

  useEffect(() => {
    if (!template || !templateCanvasRef.current) return;
    // Matches mirrorLiveView (not outputMirrored, decided later in
    // PreviewFoto) so this in-progress frame thumbnail doesn't look
    // flipped relative to the live camera feed sitting right next to it.
    renderTemplate(photoUrls, template, templateCanvasRef.current, [], {}, filter, templatePhotoMap, undefined, mirrorLiveView).catch((error) => {
      console.error("Preview frame live gagal", error);
    });
  }, [photoUrls, template, filter, templatePhotoMap, mirrorLiveView]);

  const playBeep = () => {
    if (!config.beepEnabled) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  };

  const playShutter = () => {
    if (!config.beepEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      // First click — mechanical shutter
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "square";
      osc1.frequency.value = 180;
      gain1.gain.setValueAtTime(0.35, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.07);
      // Second pop — mirror bounce
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.value = 320;
      gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.06);
      osc2.stop(ctx.currentTime + 0.18);
    } catch (_) {/* silent fail if AudioContext unavailable */}
  };

  const capture = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !sessionId) return false;

    playShutter();
    setFlash(true);
    setTimeout(() => setFlash(false), 500);

    let blob: Blob;
    if (config.cameraMode === "tether") {
      setCapturing(true);
      try {
        // One bounded retry for the whole capture round-trip — the bridge
        // itself already retries the individual digiCamControl commands, but
        // this covers a stuck first shutter release without making the
        // customer press the button again themselves.
        try {
          blob = await captureFromTether({ bridgeUrl: config.tetherBridgeUrl, slotIndex: currentSlot, filter, orientation });
        } catch (firstError) {
          console.warn("Capture tether pertama gagal, mencoba sekali lagi", firstError);
          blob = await captureFromTether({ bridgeUrl: config.tetherBridgeUrl, slotIndex: currentSlot, filter, orientation });
        }
      } finally {
        setCapturing(false);
      }
    } else {
      const video = videoRef.current;
      if (!video) return false;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.filter = FILTER_CSS[filter];
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      blob = await new Promise((resolve, reject) =>
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Gagal membuat foto"))), "image/jpeg", 0.92)
      );
    }

    // Local capture succeeded — show it and let the customer move on right
    // away. The server upload happens in the background: awaiting it here
    // used to freeze the shutter for however long that network round-trip
    // took (painful on slow venue wifi), even though nothing in the live
    // kiosk flow (strip preview, frame picker) actually needs the server
    // URL yet — only the QR share/gallery does, well after this point.
    const slotJustCaptured = currentSlot;
    const localUrl = URL.createObjectURL(blob);
    setPhotoAtSlot(slotJustCaptured, localUrl);
    setCapturedSlot(slotJustCaptured);
    setTimeout(() => setCapturedSlot(null), 1600);
    setSyncingSlots((slots) => new Set(slots).add(slotJustCaptured));
    // Fire-and-forget — doesn't block the shutter/next-slot flow. Safe to
    // overlap with the next shot's own clip capture (each call uses its own
    // local canvas/MediaRecorder, no shared mutable recording state).
    void captureSlotClip(slotJustCaptured);

    void (async () => {
      try {
        if (isBrowserOnline() && !isOfflineSessionId(sessionId)) {
          await api.uploadPhoto(sessionId, slotJustCaptured, blob);
        } else {
          // Offline (or the session itself is a client-only "offline-" id
          // with nothing to upload to yet) — queue it now rather than
          // silently dropping it. syncOfflineData() picks these up, in order,
          // once the session has a real server id.
          await addPendingPhoto(sessionId, slotJustCaptured, blob);
        }
      } catch (uploadError) {
        try {
          await addPendingPhoto(sessionId, slotJustCaptured, blob);
        } catch (queueError) {
          console.error("Gagal mengantrikan foto untuk sinkronisasi ulang", queueError);
        }
        console.warn("Upload foto ditunda untuk sinkronisasi", uploadError);
      } finally {
        setSyncingSlots((slots) => {
          if (!slots.has(slotJustCaptured)) return slots;
          const next = new Set(slots);
          next.delete(slotJustCaptured);
          return next;
        });
      }
    })();

    if (currentSlot + 1 < totalPhotos) {
      setCurrentSlot(currentSlot + 1);
    }
    return true;
  };

  // --- Per-photo clips -----------------------------------------------------
  // Each shutter press also records a short (SLOT_CLIP_DURATION_MS) clip of
  // that exact moment, uploaded on its own as slotClipUrls[slot] — a "living
  // photo" per shot, not one long recording for the whole session. At the
  // end, combineSlotClips composites all of them into the template's frame
  // simultaneously (each in its own slot) for the single downloadable
  // video/GIF shown as the main result.
  const uploadSlotMediaResult = async (slotIndex: number, kind: "gif" | "video", blob: Blob) => {
    if (!sessionId || !isBrowserOnline() || isOfflineSessionId(sessionId)) return;
    try {
      const result = await api.uploadSlotMedia(sessionId, slotIndex, kind, blob);
      const url = result?.slotClipUrls?.[slotIndex];
      if (url) setSlotClipUrl(slotIndex, url);
    } catch (error) {
      console.error(`Gagal upload klip slot ${slotIndex}`, error);
    }
  };

  // No frame baked in here on purpose — these are raw per-shot clips (like a
  // Live Photo), downloaded individually; the shared template frame only
  // gets composited once, in combineSlotClips, onto the merged output.
  const recordSlotGif = async (slotIndex: number, isTether: boolean, sourceWidth: number, sourceHeight: number) => {
    const scale = Math.min(1, GIF_MAX_WIDTH / sourceWidth);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const frames: GifFrame[] = [];
    const captureFrame = (source: CanvasImageSource) => {
      ctx.drawImage(source, 0, 0, width, height);
      const { data } = ctx.getImageData(0, 0, width, height);
      frames.push({ data, width, height });
    };
    await new Promise<void>((resolve) => {
      const tick = isTether
        ? () => {
            const image = new Image();
            // Bridge is on a different port/origin — without this, getImageData
            // below throws a SecurityError on every frame (see the crossOrigin
            // note further down for the full story).
            image.crossOrigin = "anonymous";
            image.onload = () => captureFrame(image);
            image.src = `${liveViewUrl}${liveViewUrl!.includes("?") ? "&" : "?"}slot=${slotIndex}-${Date.now()}`;
          }
        : () => captureFrame(videoRef.current!);
      tick();
      const timer = window.setInterval(tick, SLOT_CLIP_GIF_FRAME_INTERVAL_MS);
      window.setTimeout(() => {
        window.clearInterval(timer);
        resolve();
      }, SLOT_CLIP_DURATION_MS);
    });
    slotGifFramesRef.current[slotIndex] = frames;
    if (frames.length > 0) {
      await uploadSlotMediaResult(slotIndex, "gif", encodeGif(frames, SLOT_CLIP_GIF_FRAME_INTERVAL_MS));
    }
  };

  // Video: the reliable raw-stream path for webcam, crossOrigin-fixed canvas
  // capture for tether (root cause of the "110-byte empty .webm" bug —
  // confirmed live: the bridge's liveview.jpg is on a different origin, and
  // drawing it onto a canvas without the <img> opting into CORS mode taints
  // the canvas, so captureStream() silently produces no real frame data even
  // though the bridge already sends Access-Control-Allow-Origin).
  const recordSlotVideo = async (slotIndex: number, isTether: boolean, sourceWidth: number, sourceHeight: number) => {
    if (typeof MediaRecorder === "undefined") return;
    let recordingStream: MediaStream | undefined = streamRef.current ?? undefined;
    let stopDrawing: (() => void) | undefined;
    if (!recordingStream && isTether) {
      const canvas = document.createElement("canvas");
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx || typeof canvas.captureStream !== "function") return;
      const draw = () => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        image.src = `${liveViewUrl}${liveViewUrl!.includes("?") ? "&" : "?"}slot=${slotIndex}-${Date.now()}`;
      };
      draw();
      const timer = window.setInterval(draw, 66);
      stopDrawing = () => window.clearInterval(timer);
      recordingStream = canvas.captureStream(15);
    }
    if (!recordingStream) return;
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    const recorder = new MediaRecorder(recordingStream, { mimeType, videoBitsPerSecond: SLOT_VIDEO_BITRATE });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    await new Promise<void>((resolve) => {
      recorder.onstop = () => {
        stopDrawing?.();
        const blob = new Blob(chunks, { type: mimeType });
        slotVideoBlobsRef.current[slotIndex] = blob;
        void uploadSlotMediaResult(slotIndex, "video", blob);
        resolve();
      };
      recorder.start();
      window.setTimeout(() => recorder.stop(), SLOT_CLIP_DURATION_MS);
    });
  };

  // GIF and video recording used to be mutually exclusive here (a package
  // with BOTH enabled silently only ever got a GIF, since the old code
  // checked hasGif first and returned before ever reaching the video branch)
  // — confirmed live: enabling both on one package meant video was never
  // even attempted. Running both concurrently (not one-after-another) over
  // the same ~1.6s window means turning both on doesn't cost any extra
  // per-shot time — capture stays exactly as smooth as a single format.
  const captureSlotClip = async (slotIndex: number) => {
    if (!selectedPackage?.hasVideo && !selectedPackage?.hasGif) return;
    const isTether = config.cameraMode === "tether";
    if (isTether && !liveViewUrl) return;
    if (!isTether && !videoRef.current) return;

    const sourceWidth = isTether ? 960 : (videoRef.current!.videoWidth || 960);
    const sourceHeight = isTether ? 640 : (videoRef.current!.videoHeight || 640);

    const tasks: Promise<void>[] = [];
    if (selectedPackage.hasGif) {
      tasks.push(recordSlotGif(slotIndex, isTether, sourceWidth, sourceHeight).catch((error) => console.error(`Gagal rekam GIF slot ${slotIndex}`, error)));
    }
    if (selectedPackage.hasVideo) {
      tasks.push(recordSlotVideo(slotIndex, isTether, sourceWidth, sourceHeight).catch((error) => console.error(`Gagal rekam video slot ${slotIndex}`, error)));
    }
    await Promise.all(tasks);
  };

  // --- Combined "living template" output -----------------------------------
  // Once every slot has its clip, composite them all into the shared frame
  // at once (each clip looping in its own slot) for the one downloadable
  // video/GIF shown as the main result — the same frame image the still
  // photos get, but every window in it is moving instead of one.
  const combineSlotClips = async () => {
    if (!selectedPackage?.hasVideo && !selectedPackage?.hasGif) return;
    if (!sessionId || !template?.slots?.length) return;
    setMediaUploading(true);
    try {
      const style = await prepareClipFrameStyle({ template, accentColor: config.accentColor, stripLayout: config.stripLayout, stripTemplate: config.stripTemplate });
      if (!style.frameImage) return;
      // templatePhotoMap already answers "which captured photo goes in
      // template slot i" for the still-photo render — the same mapping is
      // exactly what a slot's clip should follow too.
      const sourceSlotFor = (templateSlotIndex: number) => templatePhotoMap[templateSlotIndex] ?? templateSlotIndex;

      // GIF and video used to be built as one shared `blob` behind an
      // if/else-if (hasGif always won when both were enabled — confirmed
      // live: a package with both on silently only ever produced a GIF, the
      // video branch was unreachable). Two independent blobs, each under its
      // own try/catch, so enabling both actually produces both, and one
      // failing doesn't take the other down with it.
      let gifBlob: Blob | null = null;
      if (selectedPackage.hasGif) {
        try {
          const { width, height } = pickClipCanvasSize(1, 1, style, GIF_MAX_WIDTH);
          const slotFrames = template.slots.map((_, i) => slotGifFramesRef.current[sourceSlotFor(i)] ?? null);
          const maxLen = Math.max(0, ...slotFrames.map((frames) => frames?.length ?? 0));
          if (maxLen > 0) {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d")!;
            const combined: GifFrame[] = [];
            for (let t = 0; t < maxLen; t++) {
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, width, height);
              template.slots.forEach((slot, i) => {
                const frames = slotFrames[i];
                if (!frames || frames.length === 0) return;
                const frame = frames[t % frames.length];
                const frameCanvas = document.createElement("canvas");
                frameCanvas.width = frame.width;
                frameCanvas.height = frame.height;
                frameCanvas.getContext("2d")!.putImageData(new ImageData(frame.data as unknown as Uint8ClampedArray<ArrayBuffer>, frame.width, frame.height), 0, 0);
                const dx = slot.x * width, dy = slot.y * height, dw = slot.w * width, dh = slot.h * height;
                const coverScale = Math.max(dw / frame.width, dh / frame.height);
                const sw = dw / coverScale, sh = dh / coverScale;
                ctx.drawImage(frameCanvas, (frame.width - sw) / 2, (frame.height - sh) / 2, sw, sh, dx, dy, dw, dh);
              });
              ctx.drawImage(style.frameImage!, 0, 0, width, height);
              const { data } = ctx.getImageData(0, 0, width, height);
              combined.push({ data, width, height });
            }
            gifBlob = encodeGif(combined, SLOT_CLIP_GIF_FRAME_INTERVAL_MS);
          }
        } catch (error) {
          console.error("Gagal membuat GIF gabungan", error);
        }
      }

      let videoBlob: Blob | null = null;
      if (selectedPackage.hasVideo && typeof MediaRecorder !== "undefined") {
        try {
          const { width, height } = pickClipCanvasSize(1, 1, style, 720);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d")!;
          if (typeof canvas.captureStream === "function") {
            const videos = await Promise.all(template.slots.map(async (_, i) => {
              const clipBlob = slotVideoBlobsRef.current[sourceSlotFor(i)];
              if (!clipBlob) return null;
              const video = document.createElement("video");
              video.src = URL.createObjectURL(clipBlob);
              video.muted = true;
              video.loop = true;
              video.playsInline = true;
              await new Promise<void>((resolve) => {
                video.onloadeddata = () => resolve();
                video.onerror = () => resolve();
              });
              await video.play().catch(() => undefined);
              return video;
            }));

            if (videos.some(Boolean)) {
              const drawTick = () => {
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, width, height);
                template.slots.forEach((slot, i) => {
                  const video = videos[i];
                  if (!video) return;
                  const dx = slot.x * width, dy = slot.y * height, dw = slot.w * width, dh = slot.h * height;
                  const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
                  const coverScale = Math.max(dw / vw, dh / vh);
                  const sw = dw / coverScale, sh = dh / coverScale;
                  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, dx, dy, dw, dh);
                });
                ctx.drawImage(style.frameImage!, 0, 0, width, height);
              };
              drawTick();
              const drawTimer = window.setInterval(drawTick, 66);

              const stream = canvas.captureStream(15);
              const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
              const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: SLOT_VIDEO_BITRATE });
              const chunks: Blob[] = [];
              recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunks.push(event.data);
              };
              videoBlob = await new Promise<Blob>((resolve) => {
                recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
                recorder.start();
                window.setTimeout(() => recorder.stop(), SLOT_CLIP_DURATION_MS + 300);
              });
              window.clearInterval(drawTimer);
            }
            videos.forEach((video) => {
              if (!video) return;
              video.pause();
              URL.revokeObjectURL(video.src);
            });
          }
        } catch (error) {
          console.error("Gagal membuat video gabungan", error);
        }
      }

      if (!gifBlob && !videoBlob) return;
      if (isBrowserOnline() && !isOfflineSessionId(sessionId)) {
        if (gifBlob) {
          try {
            const result = await api.uploadMedia(sessionId, "gif", gifBlob);
            if (result?.gifUrl) setMediaUrl(result.gifUrl);
          } catch (error) {
            console.error("Gagal upload GIF gabungan", error);
          }
        }
        if (videoBlob) {
          try {
            const result = await api.uploadMedia(sessionId, "video", videoBlob);
            if (result?.videoUrl) setMediaUrl(result.videoUrl);
          } catch (error) {
            console.error("Gagal upload video gabungan", error);
          }
        }
      }
    } catch (error) {
      console.error("Gagal menggabungkan klip semua slot", error);
      showCaptureNotice("Gagal membuat video/GIF gabungan, tapi foto & klip per-foto tetap tersimpan.");
    } finally {
      setMediaUploading(false);
    }
  };

  const combineTriggeredRef = useRef(false);
  useEffect(() => {
    if (combineTriggeredRef.current) return;
    if (!selectedPackage?.hasVideo && !selectedPackage?.hasGif) return;
    if (!(sessionComplete || (eventTimerEnabled && remainingSeconds <= 0))) return;
    combineTriggeredRef.current = true;
    void combineSlotClips();
  }, [sessionComplete, eventTimerEnabled, remainingSeconds, selectedPackage?.hasVideo, selectedPackage?.hasGif]);

  const startCountdown = () => {
    if (!previewReady || countdown !== null || (eventTimerEnabled && remainingSeconds <= 0) || sessionComplete || captureLockRef.current) return;
    captureLockRef.current = true;
    setCaptureNotice(null);
    if (config.cameraMode === "tether") {
      setFocusing(true);
      focusTetherCamera(config.tetherBridgeUrl)
        .catch((error) => showCaptureNotice(error instanceof Error ? error.message : "Autofocus kamera gagal."))
        .finally(() => setFocusing(false));
    }
    let n = config.countdownSeconds;
    setCountdown(n);
    playBeep();
    const interval = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(interval);
        setCountdown(null);
        capture().catch((error) => {
          showCaptureNotice(error instanceof Error ? error.message : "Gagal mengambil foto dari kamera.");
        }).finally(() => {
          captureLockRef.current = false;
        });
      } else {
        setCountdown(n);
        playBeep();
      }
    }, 1000);
  };

  // Auto-capture: fires startCountdown itself after a short pause instead of
  // waiting for a shutter tap, for every shot including the first — camera
  // ready + nothing already in progress is enough to (re)schedule it. Guarded
  // by captureLockRef (inside startCountdown) against the brief async window
  // right after a countdown ends where countdown is already null but the
  // previous capture() hasn't resolved yet, so this never double-fires.
  useEffect(() => {
    if (!config.autoCaptureEnabled || isEditMode) return;
    if (!previewReady || sessionComplete || countdown !== null || finishingEarly) return;
    const timer = window.setTimeout(() => startCountdown(), 2500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.autoCaptureEnabled, isEditMode, previewReady, sessionComplete, countdown, finishingEarly, currentSlot]);

  const retake = (slot: number) => {
    setCurrentSlot(slot);
  };

  const finishEarly = async () => {
    if (finishingEarly || countdown !== null || capturing) return;
    setFinishingEarly(true);
    // Bypassing the natural sessionComplete/timer-expiry path (that's what
    // this button is for), so the combine effect below never fires on its
    // own here — trigger it directly, same guard ref so it can't also fire
    // twice if sessionComplete somehow flips true around the same time.
    if (!combineTriggeredRef.current) {
      combineTriggeredRef.current = true;
      await combineSlotClips();
    }
    navigate(getNextRoute("capture", config.kioskFlow));
  };

  return (
    <ScreenLayoutBoundary screenKey="capture">
    <div className="kinetic-page kinetic-page-session relative flex h-full min-h-0 w-full flex-col overflow-hidden px-3 pb-3 pt-[4.25rem] sm:px-6 lg:px-8">
      <StepProgress current="capture" />
      <header className="relative z-10 mx-auto flex w-full max-w-[1800px] flex-wrap items-center justify-between gap-3">
        <Positionable id="heading" type="text" label="Judul">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{config.captureHeadline || "Siap untuk momenmu?"}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {countdown !== null ? "Tahan pose… sebentar lagi!" : sessionComplete ? "Semua foto sudah diambil. Lanjut untuk mempercantik hasilnya." : config.autoCaptureEnabled ? "Mode otomatis: foto berikutnya diambil sendiri." : "Ketuk tombol bulat di layar kamera untuk mulai hitung mundur."}
            </p>
          </div>
        </Positionable>
        <div className="flex items-center gap-2">
          {config.autoCaptureEnabled && <span className="k-chip k-chip-accent"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Mode otomatis</span>}
          <span className="k-chip k-chip-accent !text-sm"><Icon name="camera" className="h-4 w-4" />Foto {Math.min(currentSlot + 1, totalPhotos)} dari {totalPhotos}</span>
          {eventTimerEnabled && (
            <span className={`k-chip !text-sm ${remainingSeconds < 30 ? "!border-red-400/40 !bg-red-500/10 !text-red-500" : ""}`}>
              <Icon name="clock" className="h-4 w-4" />
              {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")}
            </span>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto mt-3 grid min-h-0 w-full max-w-[1800px] flex-1 items-stretch gap-3 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] landscape:lg:grid-cols-[minmax(230px,300px)_minmax(0,1fr)_minmax(280px,340px)] landscape:lg:grid-rows-1 xl:gap-4">
        {/* Full redesign of the captured-photos rail — thumbnails were
            cramped (a 108px ceiling on a wide-but-short kiosk screen made
            them look tiny) and "retake" had zero visual affordance beyond a
            slightly different border color. Bigger cells, an explicit
            refresh icon + "Ambil ulang" label baked into every filled
            thumbnail (not just on hover — this is a touchscreen), and a
            plainer instruction line up top. */}
        <section className="glass-panel order-2 flex min-h-0 flex-col overflow-hidden rounded-[2rem] p-3 landscape:lg:order-1 landscape:lg:h-full landscape:lg:p-4">
          <div className="flex items-center justify-between">
            <div><h2 className="font-display text-xl font-semibold">Jepretan</h2></div>
            <span className="k-chip k-chip-accent">{photoUrls.filter(Boolean).length}/{totalPhotos}</span>
          </div>
          <p className="mt-2 hidden items-center gap-1.5 text-xs leading-5 text-fg/50 landscape:flex">
            <IconRefreshSmall className="h-3.5 w-3.5 shrink-0 text-fg/40" /> Ketuk foto yang sudah jadi untuk ambil ulang.
          </p>
          {/* `auto-rows-fr` (not `content-start`) is what actually stretches
              every row to share out whatever height this column has — with
              `content-start` (or a fixed per-cell height like the old
              `h-[clamp(...)]`) the rows just pack at their own natural size
              and leave the rest of a tall/roomy screen empty below, which is
              exactly the "kurang terisi" (under-filled) complaint. */}
          <div className="mt-2 flex gap-2.5 overflow-x-auto portrait:pb-1 landscape:mt-3 landscape:grid landscape:min-h-0 landscape:flex-1 landscape:auto-rows-fr landscape:grid-cols-2 landscape:overflow-visible">{Array.from({ length: totalPhotos }).map((_, index) => {
            const photoUrl = photoUrls[index];
            const isCurrent = index === currentSlot;
            return (
            <button
              key={index}
              onClick={() => photoUrl && config.features.retake && retake(index)}
              disabled={!photoUrl}
              className={`group relative flex h-24 w-20 shrink-0 min-h-0 flex-col overflow-hidden rounded-2xl border-2 landscape:h-full landscape:w-auto bg-fg/[0.04] transition ${isCurrent ? "border-accent shadow-lg shadow-accent/25" : photoUrl ? "border-fg/15 hover:border-fg/35" : "border-dashed border-fg/15"}`}
            >
              {photoUrl ? (
                <>
                  <img src={photoUrl} alt={`Hasil foto ${index + 1}`} className="block h-full w-full flex-1 object-cover transition group-hover:scale-105" />
                  {/* Always-visible retake bar — a hover-only affordance is
                      invisible on a touchscreen, so this can't be hover-only. */}
                  <span className={`${config.features.retake ? "flex" : "hidden"} shrink-0 items-center justify-center gap-1 bg-black/70 py-1.5 text-[0.625rem] font-semibold text-white/85 backdrop-blur-sm`}>
                    <IconRefreshSmall className="h-3 w-3" /> Ambil ulang
                  </span>
                </>
              ) : (
                <span className="flex h-full flex-1 flex-col items-center justify-center gap-1.5 text-fg/30">
                  <IconCameraSmall className="h-6 w-6" />
                  <span className="text-[0.6875rem]">Menunggu</span>
                </span>
              )}
              <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold ${isCurrent ? "bg-accent text-white" : "bg-black/70 text-white/85"}`}>{index + 1}</span>
              {syncingSlots.has(index) && (
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-black/70" title="Menyimpan ke server...">
                  <span className="h-2.5 w-2.5 animate-spin rounded-full border border-fg/40 border-t-accent" />
                </span>
              )}
            </button>
            );
          })}</div>
        </section>

        <main className="order-1 flex min-h-0 min-w-0 flex-col landscape:lg:order-2">
          {/* flex-1 + items-center here (instead of the old fixed vh height)
              is what makes this fill whatever vertical space this column
              actually has. The box's pixel size is computed in JS (see the
              ResizeObserver effect above) to match whatever the camera feed
              is actually streaming (measured live via reportLiveAspect) —
              a Canon's live view is commonly 3:2 or 16:9, not 4:3, and
              forcing 4:3 on a feed that isn't produced visible letterbox
              bars. Fills the whole available box until the first real
              frame/metadata arrives — matching the session's print
              orientation instead (portrait output, say) used to waste the
              screen either side of a landscape kiosk display for no reason,
              since that orientation is only a later cropping step, not
              something the live viewfinder itself needs to pre-match. Plain CSS aspect-ratio was
              tried first but doesn't reliably fill a flex item — see the
              comment on previewContainerRef above. */}
          <div ref={previewContainerRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[2rem] bg-[#0b0d16] p-1.5 shadow-2xl ring-1 ring-fg/10">
            <motion.div
              animate={{ scale: flash ? 1.08 : 1 }}
              transition={{ duration: flash ? 0.18 : 0.4, ease: flash ? "easeOut" : "easeInOut" }}
              style={{
                zIndex: flash ? 30 : "auto",
                width: previewSize?.width,
                height: previewSize?.height,
              }}
              className="relative max-h-full max-w-full overflow-hidden rounded-[1.7rem]"
            >
              {!previewReady && !cameraError && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80">
                  <div className="h-10 w-10 rounded-full border-2 border-fg/20 border-t-accent animate-spin" />
                  <span className="mt-4 text-sm text-fg/60">{liveViewStarting ? "Menyalakan live view kamera..." : "Menyiapkan kamera..."}</span>
                </div>
              )}
              {cameraError && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: "var(--kiosk-background)" }}>
                  <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-red-400/10 text-3xl">!</span>
                  <p className="mt-4 font-display text-xl font-semibold">Kamera belum tersedia</p>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-fg/50">{cameraError}</p>
                  <p className="mt-4 rounded-xl border border-fg/10 bg-fg/5 px-4 py-2 text-xs text-fg/40">
                    {config.cameraMode === "tether"
                      ? "Pastikan digiCamControl berjalan dan kamera Canon terhubung lewat USB — layar ini akan tertutup otomatis begitu terdeteksi lagi."
                      : "Izinkan akses kamera pada browser, lalu muat ulang halaman."}
                  </p>
                </div>
              )}
              {config.cameraMode === "tether" ? (
                <div className="relative h-full w-full bg-black">
                  <img
                    src={liveViewUrl ?? undefined}
                    alt="Live view kamera Canon"
                    className="h-full w-full object-contain"
                    style={{ transform: mirrorLiveView ? "scaleX(-1)" : undefined }}
                    onLoad={(event) => {
                      liveViewFailStreakRef.current = 0;
                      if (liveViewLost) setLiveViewLost(false);
                      reportLiveAspect(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
                    }}
                    onError={() => {
                      liveViewFailStreakRef.current += 1;
                      // A handful of consecutive failed frames (not just one —
                      // a single dropped frame during a poll is normal) means
                      // the feed is actually down, not just briefly busy.
                      if (liveViewFailStreakRef.current >= 8 && !liveViewLost) setLiveViewLost(true);
                    }}
                  />
                  {liveViewLost && !cameraError && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/70 text-center">
                      <div className="h-6 w-6 rounded-full border-2 border-fg/20 border-t-amber-400 animate-spin" />
                      <p className="text-sm text-amber-200">Live view terputus, menyambung ulang...</p>
                    </div>
                  )}
                  <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-emerald-300/40 bg-black/60 px-3 py-1 text-xs text-emerald-200 backdrop-blur-sm">
                    LIVE VIEW
                  </div>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={(event) => reportLiveAspect(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
                  className="h-full w-full object-cover"
                  style={{ filter: FILTER_CSS[filter], transform: mirrorLiveView ? "scaleX(-1)" : undefined }}
                />
              )}
              <button
                type="button"
                onClick={() => useKioskSession.getState().setMirrorLiveView(!useKioskSession.getState().mirrorLiveView)}
                aria-pressed={mirrorLiveView}
                className="absolute right-3 top-3 z-30 flex items-center gap-2 rounded-full border border-white/25 bg-black/55 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-black/70"
              >
                <Icon name="mirror" className="h-4 w-4" />
                Cermin {mirrorLiveView ? "aktif" : "mati"}
              </button>
              {flash && <div className="pointer-events-none absolute inset-0 animate-flash bg-white" />}
              {capturing && (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center">
                  <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-xs text-white/80 backdrop-blur-sm">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                    Mengambil foto dari kamera...
                  </div>
                </div>
              )}
              <motion.button
                onClick={startCountdown}
                disabled={!previewReady || countdown !== null}
                whileTap={{ scale: 0.92 }}
                aria-label="Ambil foto"
                className="absolute left-1/2 top-[78%] z-30 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-fg shadow-[0_0_0_4px_rgba(0,0,0,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60 sm:h-28 sm:w-28"
              >
                {countdown !== null ? (
                  <>
                    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
                      <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
                      <circle cx="50" cy="50" r="44" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray="276" strokeDashoffset={276 * (1 - countdown / Math.max(1, config.countdownSeconds))} transform="rotate(-90 50 50)" />
                    </svg>
                    <span className="relative text-3xl font-bold text-fg drop-shadow">{countdown}</span>
                  </>
                ) : (
                  <span className={`flex h-[85%] w-[85%] items-center justify-center rounded-full bg-white shadow-inner transition ${focusing ? "animate-pulse" : ""}`}>
                    <svg viewBox="0 0 24 24" className="h-8 w-8 text-accent" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
                      <circle cx="12" cy="13" r="3.4" />
                    </svg>
                  </span>
                )}
              </motion.button>
            </motion.div>
          </div>
          {captureNotice && <p className="relative z-10 mt-3 text-center text-sm text-amber-300">{captureNotice}</p>}
          {/* Above the filter bar, not below it — customers scanning this
              screen top-to-bottom hit "continue" before they'd even reach a
              filter row buried at the very bottom, which read as if there
              was no way forward at all. */}
          {sessionComplete && (
            <button onClick={() => navigate(getNextRoute("capture", config.kioskFlow))} disabled={mediaUploading} className="k-btn k-btn-accent k-btn-lg relative z-10 mt-3 w-full disabled:cursor-wait disabled:opacity-60">
              {mediaUploading
                ? <><Spinner size="md" />{selectedPackage?.hasGif && selectedPackage?.hasVideo
                    ? "Menyimpan GIF & video sesi..."
                    : selectedPackage?.hasGif ? "Menyimpan GIF sesi..." : "Menyimpan video sesi..."}</>
                : <>Lanjut: percantik hasil foto <Icon name="arrow-right" className="h-5 w-5" /></>}
            </button>
          )}
          {canFinishEarly && (
            <button onClick={finishEarly} disabled={finishingEarly} className="k-btn relative z-10 mt-3 w-full !border-accent/40 !bg-accent/10 !text-accent disabled:cursor-wait disabled:opacity-60">
              {finishingEarly ? "Menyimpan..." : <>Frame sudah penuh ({templateSlotCount} foto) — Lanjutkan sekarang <span className="ml-2">→</span></>}
            </button>
          )}
          {config.features.filters && (
          <div className="glass-panel mt-3 rounded-2xl p-3"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Filter warna</span><span className="font-semibold text-accent">{FILTER_LABELS[filter]}</span></div><div className="mt-2 flex justify-center gap-2 overflow-x-auto pb-1">{FILTER_ORDER.map((key) => <button key={key} onClick={() => setFilter(key)} className={`min-w-[4.25rem] rounded-xl border p-1 text-center transition ${filter === key ? "border-accent bg-accent/15 shadow-lg shadow-accent/20" : "border-fg/10 bg-fg/5 hover:border-fg/30"}`}><div className="h-7 rounded-lg bg-fg/10" style={{ filter: FILTER_CSS[key] }} /><span className="mt-1 block text-[0.5625rem]">{FILTER_LABELS[key]}</span></button>)}</div></div>
          )}
        </main>

        <section className="glass-panel order-3 hidden min-h-0 h-full flex-col overflow-hidden rounded-[2rem] p-3 landscape:lg:flex"><div className="flex items-center justify-between"><div><h2 className="font-display text-xl font-semibold">Dalam frame</h2></div><span className="max-w-[45%] truncate rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-[0.625rem] text-accent">{template?.name ?? "Belum dipilih"}</span></div><p className="mt-2 text-xs leading-5 text-[var(--kiosk-muted)]">Foto otomatis masuk ke frame pilihan.</p>{template ? (
          // `h-full w-full` (not just `max-h-full max-w-full`) is load-bearing:
          // a <canvas> with no explicit size renders at its own drawing-buffer
          // resolution and just sits there small on a roomy screen — max-*
          // alone only ever shrinks it back down, never grows it to fill
          // available space. `object-contain` then keeps the drawn frame's
          // real aspect ratio inside that stretched box instead of distorting it.
          <div className="mt-3 flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-fg/10 bg-fg/[0.04] p-3">
            <canvas ref={templateCanvasRef} className="h-full w-full rounded-xl object-contain" />
          </div>
        ) : <div className="mt-3 flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-fg/15 text-xs text-[var(--kiosk-muted)]">Frame belum dipilih</div>}</section>
      </div>
      {eventTimerEnabled && remainingSeconds <= 0 && (
        <TimerExpiredOverlay onSkip={() => navigate(getNextRoute("capture", config.kioskFlow))} waitingForMedia={mediaUploading} />
      )}

      {/* Capture success toast */}
      <AnimatePresence>
        {capturedSlot !== null && (
          <motion.div
            key={capturedSlot}
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3"
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: [0.7, 1.15, 1], opacity: [0, 1, 1] }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-400/20 ring-4 ring-emerald-400/40 shadow-2xl shadow-emerald-400/20"
            >
              <Icon name="check" className="h-10 w-10 text-emerald-300" strokeWidth={3} />
            </motion.div>
            <div className="rounded-2xl border border-emerald-400/30 bg-black/80 px-5 py-3 text-center backdrop-blur-md shadow-2xl">
              <p className="font-display text-lg font-semibold text-emerald-300">Foto ke-{capturedSlot + 1} berhasil!</p>
              <p className="text-xs text-fg/50 mt-0.5">{capturedSlot + 1} dari {totalPhotos} foto diambil</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <canvas ref={canvasRef} className="hidden" />

    </div>
    </ScreenLayoutBoundary>
  );
}
