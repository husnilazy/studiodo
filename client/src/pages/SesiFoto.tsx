import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useKioskSession, FILTER_CSS, FILTER_LABELS, type CameraFilter } from "@/lib/sessionStore";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { captureFromTether } from "@/lib/camera";
import { renderTemplate } from "@/lib/output";
import { useTemplateLibrary } from "@/lib/templateStore";

const VIBE_GRADIENTS: Record<string, string> = {
  Electric: "linear-gradient(135deg, #7C3AED, #06B6D4)",
  "Cotton Candy": "linear-gradient(135deg, #F472B6, #A78BFA)",
  Ocean: "linear-gradient(135deg, #0EA5E9, #0F766E)",
  Sunset: "linear-gradient(135deg, #F97316, #DB2777)",
  Mono: "linear-gradient(135deg, #4B5563, #111827)",
};

// Sony Imaging Edge Webcam / virtual cam warm-up guard
const CAMERA_WARMUP_MS = 2800;
const FILTER_ORDER: CameraFilter[] = ["normal", "bw", "warm", "cool", "vintage", "fade", "vivid"];

export default function SesiFoto() {
  const [, navigate] = useLocation();
  const config = useBoothConfig((s) => s.config);
  const {
    sessionId,
    selectedPackage,
    orientation,
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
  } = useKioskSession();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(config.sessionTimerMinutes * 60);
  const storedTemplate = useTemplateLibrary((state) => state.templates.find((item) => item.id === selectedTemplateId));
  const template = selectedTemplateData ?? storedTemplate;
  const templateCanvasRef = useRef<HTMLCanvasElement>(null);

  // Persisted kiosk configs from older versions may not have the capture limit yet.
  const maxPhotosPerSession = Number.isFinite(config.maxPhotosPerSession) && config.maxPhotosPerSession > 0
    ? config.maxPhotosPerSession
    : 10;
  const packagePhotoCount = Number.isFinite(selectedPackage?.photoCount) && (selectedPackage?.photoCount ?? 0) > 0
    ? selectedPackage?.photoCount ?? 3
    : 3;
  const totalPhotos = Math.min(packagePhotoCount, maxPhotosPerSession);
  const capturedCount = photoUrls.filter(Boolean).length;
  const sessionComplete = capturedCount >= totalPhotos;

  useEffect(() => {
    beginSessionTimer();
    const timer = window.setInterval(() => {
      const startedAt = useKioskSession.getState().sessionStartedAt;
      const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
      setRemainingSeconds(Math.max(0, config.sessionTimerMinutes * 60 - elapsed));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [beginSessionTimer, config.sessionTimerMinutes]);

  useEffect(() => {
    if (!selectedPackage || !sessionId) {
      navigate("/paket");
      return;
    }
    let stream: MediaStream | undefined;
    (async () => {
      if (config.cameraMode === "tether") {
        setCameraReady(true);
        return;
      }
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

  useEffect(() => {
    if (!template || !templateCanvasRef.current) return;
    renderTemplate(photoUrls, template, templateCanvasRef.current, [], {}, filter, templatePhotoMap).catch((error) => {
      console.error("Preview frame live gagal", error);
    });
  }, [photoUrls, template, filter, templatePhotoMap]);

  const playBeep = () => {
    if (!config.beepEnabled) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  };

  const capture = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !sessionId) return false;

    setFlash(true);
    setTimeout(() => setFlash(false), 400);

    let blob: Blob;
    if (config.cameraMode === "tether") {
      blob = await captureFromTether({
        bridgeUrl: config.tetherBridgeUrl,
        slotIndex: currentSlot,
        filter,
        orientation,
      });
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

    setUploading(true);
    try {
      const localUrl = URL.createObjectURL(blob);
      setPhotoAtSlot(currentSlot, localUrl); // optimistic preview
      await api.uploadPhoto(sessionId, currentSlot, blob);
    } catch (err) {
      console.error("Gagal mengambil foto", err);
      setCameraError(err instanceof Error ? err.message : "Gagal mengambil foto dari kamera.");
      return false;
    } finally {
      setUploading(false);
    }

    if (currentSlot + 1 < totalPhotos) {
      setCurrentSlot(currentSlot + 1);
    }
    return true;
  };

  const startClipRecording = () => {
    if (!streamRef.current || typeof MediaRecorder === "undefined" || !selectedPackage?.hasVideo && !selectedPackage?.hasGif) return;
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recordingChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordingChunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(recordingChunksRef.current, { type: mimeType });
      const kind = selectedPackage?.hasVideo ? "video" : "gif";
      try {
        const result = await api.uploadMedia(sessionId!, kind, blob);
        const mediaUrl = result.videoUrl ?? result.gifUrl;
        if (mediaUrl) setMediaUrl(mediaUrl);
      } catch (error) {
        console.error("Gagal upload klip media", error);
      }
    };
    recorderRef.current = recorder;
    recorder.start();
  };

  const stopClipRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
  };

  const startCountdown = () => {
    if (!cameraReady || countdown !== null || remainingSeconds <= 0) return;
    let n = config.countdownSeconds;
    setCountdown(n);
    playBeep();
    startClipRecording();
    const interval = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(interval);
        setCountdown(null);
        capture().finally(stopClipRecording);
      } else {
        setCountdown(n);
        playBeep();
      }
    }, 1000);
  };

  const retake = (slot: number) => {
    setCurrentSlot(slot);
  };

  return (
    <div className="kinetic-page relative flex h-full min-h-0 w-full flex-col overflow-hidden px-3 py-3 sm:px-6 lg:px-8">
      <div
        className="absolute inset-0 bg-[length:200%_200%] animate-gradient opacity-30"
        style={{ backgroundImage: VIBE_GRADIENTS[config.captureVibe] }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
        <div>
          <p className="eyebrow">PHOTO SESSION</p>
          <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">Siap untuk momenmu?</h1>
        </div>
        <div className="glass-panel flex items-center gap-3 rounded-2xl px-3 py-2 sm:gap-5 sm:px-5">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">Progress</p>
            <p className="text-sm font-semibold">{currentSlot + 1} <span className="text-white/40">/ {totalPhotos}</span></p>
          </div>
          <div className={`border-l pl-3 text-right sm:pl-5 ${remainingSeconds < 30 ? "border-red-400/40 text-red-300" : "border-white/10 text-white/70"}`}>
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">Sisa waktu</p>
            <p className="text-sm font-semibold">{Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")}</p>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto mt-3 grid min-h-0 w-full max-w-[1800px] flex-1 items-stretch gap-3 lg:grid-cols-[240px_minmax(0,1fr)_360px] xl:gap-4">
        <section className="order-2 flex min-h-0 h-full flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 p-3 backdrop-blur-xl lg:order-1">
          <div className="flex items-center justify-between"><div><p className="eyebrow mb-1">CAPTURE FEED</p><h2 className="font-display text-xl font-semibold">Jepretan</h2></div><span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] text-accent">{photoUrls.filter(Boolean).length}/{totalPhotos}</span></div>
          <p className="mt-2 text-xs leading-5 text-white/45">Pilih foto untuk retake.</p>
          <div className="mt-3 grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-hidden">{Array.from({ length: totalPhotos }).map((_, index) => {
            const photoUrl = photoUrls[index];
            return (
            <button key={index} onClick={() => photoUrl && retake(index)} className={`group relative h-[clamp(74px,12vh,108px)] min-h-0 overflow-hidden rounded-xl border bg-black/20 ${index === currentSlot ? "border-accent shadow-lg shadow-accent/20" : "border-white/10"}`}>
              {photoUrl ? <img src={photoUrl} alt={`Hasil foto ${index + 1}`} className="block h-full w-full object-cover transition group-hover:scale-105" /> : <span className="flex h-full flex-col items-center justify-center gap-1 text-[10px] text-white/30"><span className="text-base">{index + 1}</span><span>Menunggu</span></span>}
              <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px]">{index + 1}</span>
            </button>
            );
          })}</div>
        </section>

        <main className="order-1 flex min-h-0 min-w-0 flex-col lg:order-2">
          <div className="glass-panel relative overflow-hidden rounded-[2rem] border-white/10 bg-black/60 p-1 shadow-2xl shadow-black/30">
            <div className={`relative mx-auto overflow-hidden rounded-[1.7rem] ${
              orientation === "landscape" ? "h-[min(68vh,760px)] w-full" : "h-[min(68vh,760px)] w-auto max-w-full"
            }`}>
              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80">
                  <div className="h-10 w-10 rounded-full border-2 border-white/20 border-t-accent animate-spin" />
                  <span className="mt-4 text-sm text-white/60">Menyiapkan kamera...</span>
                </div>
              )}
              {cameraError && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#101014] px-6 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-red-400/10 text-3xl">!</span>
                  <p className="mt-4 font-display text-xl font-semibold">Kamera belum tersedia</p>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-white/50">{cameraError}</p>
                  <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/40">Izinkan akses kamera pada browser, lalu muat ulang halaman.</p>
                </div>
              )}
              {config.cameraMode === "tether" ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-black px-8 text-center">
                  <span className="text-4xl">📷</span>
                  <span className="font-display text-xl">Canon DSLR siap</span>
                  <span className="text-sm text-white/50">Tekan tombol capture untuk mengambil foto melalui bridge tether.</span>
                </div>
              ) : (
                <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ filter: FILTER_CSS[filter] }} />
              )}
              {flash && <div className="pointer-events-none absolute inset-0 animate-flash bg-white" />}
              <motion.button
                onClick={startCountdown}
                disabled={!cameraReady || countdown !== null || uploading}
                whileTap={{ scale: 0.92 }}
                aria-label="Ambil foto"
                className="absolute left-1/2 top-[78%] z-30 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-white/75 bg-black/20 shadow-lg shadow-black/30 backdrop-blur-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 sm:h-24 sm:w-24"
                style={{ borderRadius: "9999px" }}
              >
                {countdown !== null ? (
                  <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
                    <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="3" />
                    <circle cx="50" cy="50" r="44" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeDasharray="276" strokeDashoffset={276 * (1 - countdown / Math.max(1, config.countdownSeconds))} transform="rotate(-90 50 50)" />
                  </svg>
                ) : <span className="h-4 w-4 rounded-full border border-white/90 bg-white/10" />}
                {countdown !== null && <span className="relative text-2xl font-semibold text-white">{countdown}</span>}
              </motion.button>
            </div>
          </div>
          {cameraError && <p className="relative z-10 mt-3 text-center text-sm text-red-300">{cameraError}</p>}
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 backdrop-blur-xl"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-[0.16em] text-white/40">Filter</span><span className="font-semibold text-accent">{FILTER_LABELS[filter]}</span></div><div className="mt-2 flex justify-center gap-2 overflow-x-auto pb-1">{FILTER_ORDER.map((key) => <button key={key} onClick={() => setFilter(key)} className={`min-w-[68px] rounded-xl border p-1 text-center transition ${filter === key ? "border-accent bg-accent/15 shadow-lg shadow-accent/20" : "border-white/10 bg-white/5 hover:border-white/30"}`}><div className="h-7 rounded-lg bg-white/10" style={{ filter: FILTER_CSS[key] }} /><span className="mt-1 block text-[9px]">{FILTER_LABELS[key]}</span></button>)}</div></div>
          {sessionComplete && (
            <button onClick={() => navigate("/preview")} className="kinetic-button mt-4 flex min-h-14 w-full items-center justify-center rounded-2xl bg-accent px-6 py-4 text-lg font-semibold shadow-lg shadow-accent/25">
              Lanjut edit hasil foto <span className="ml-2">→</span>
            </button>
          )}
        </main>

        <section className="order-3 flex min-h-0 h-full flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 p-3 backdrop-blur-xl"><div className="flex items-center justify-between"><div><p className="eyebrow mb-1">LIVE COMPOSITION</p><h2 className="font-display text-xl font-semibold">Dalam frame</h2></div><span className="max-w-[45%] truncate rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] text-accent">{template?.name ?? "Belum dipilih"}</span></div><p className="mt-2 text-xs leading-5 text-white/45">Foto otomatis masuk ke frame pilihan.</p>{template ? <div className="mt-3 flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-white/10 bg-black/30 p-3"><canvas ref={templateCanvasRef} className="max-h-full max-w-full rounded-xl object-contain" /></div> : <div className="mt-3 flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-white/15 text-xs text-white/35">Frame belum dipilih</div>}</section>
      </div>
      {remainingSeconds <= 0 && (
        <p className="relative z-10 mt-3 rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-200">Waktu sesi habis. Lanjutkan ke preview.</p>
      )}
      <canvas ref={canvasRef} className="hidden" />

    </div>
  );
}
