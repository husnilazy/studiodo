import { useEffect, useRef, useState } from "react";

interface Props {
  onDetect: (text: string) => void;
  onClose: () => void;
}

/** Only render this when `"BarcodeDetector" in window` — the caller decides visibility. */
export default function QrCodeScanner({ onDetect, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    const detector = new BarcodeDetector({ formats: ["qr_code"] });

    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } })
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(() => undefined);
        }
        pollInterval = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const results = await detector.detect(videoRef.current);
            const value = results[0]?.rawValue?.trim();
            if (value) {
              if (pollInterval) clearInterval(pollInterval);
              onDetect(value);
            }
          } catch {
            // A transient decode failure (frame mid-motion, etc.) just tries again next tick.
          }
        }, 300);
      })
      .catch(() => setError("Tidak bisa mengakses kamera. Pastikan izin kamera diberikan."));

    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Scan QR tiket">
      <div className="relative flex w-full max-w-md flex-col items-center gap-4 rounded-[2rem] border border-white/15 bg-ink-800 p-6 text-center shadow-2xl">
        <button onClick={onClose} className="absolute right-5 top-4 text-2xl text-white/50 hover:text-white" aria-label="Tutup scanner">×</button>
        <span className="eyebrow text-accent">SCAN QR TIKET</span>
        <h3 className="font-display text-2xl font-bold">Arahkan QR ke kamera</h3>
        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : (
          <div className="aspect-square w-full max-w-xs overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          </div>
        )}
        <p className="text-xs text-white/40">Kode akan terisi otomatis begitu QR terbaca.</p>
      </div>
    </div>
  );
}
