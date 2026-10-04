import { drawImageCover, loadImage } from "./output";
import { composeFilterCss, type CameraFilter, type ColorCorrection } from "./sessionStore";
import type { LocalTemplate } from "./templateStore";

// Stop-motion video: every photo of the session shown one after another, each held long enough to actually look at
// (default 0.9 s) — unlike the live GIF/video clips, which loop fast. The admin can wrap it in a dedicated frame
// (a template saved in the reserved "stop motion" category, see FrameManagement.tsx); without one it is a plain
// full-bleed slideshow. The video is recorded in real time from a canvas, so a 4-photo session takes about 6 seconds.

export const STOP_MOTION_CATEGORY = "__stopmotion";

const MAX_WIDTH = 720;
const INTRO_MS = 600; // empty frame first, so the first photo "arrives" instead of already being there
const OUTRO_EXTRA_MS = 900; // the last photo stays a little longer before the loop restarts
const POP_MS = 220; // each new photo scales in + a soft flash, like a camera snapshot
const VIDEO_BITRATE = 5_000_000;

export interface StopMotionOptions {
  photoUrls: string[];
  /** Frame to wrap the photos in; its FIRST slot is where every photo appears. null = plain full-bleed photos. */
  template: LocalTemplate | null;
  secondsPerPhoto: number;
  mirror: boolean;
  filter: CameraFilter;
  correction: ColorCorrection;
  onProgress?: (fraction: number) => void;
}

export async function renderStopMotion(options: StopMotionOptions): Promise<Blob | null> {
  if (typeof MediaRecorder === "undefined") return null;
  const photos = (await Promise.all(options.photoUrls.filter(Boolean).map((url) => loadImage(url).catch(() => null)))).filter(Boolean) as HTMLImageElement[];
  if (photos.length === 0) return null;

  const frameImage = options.template ? await loadImage(options.template.frameDataUrl).catch(() => null) : null;
  const slot = options.template?.slots?.[0] ?? null;

  // Canvas shape: the frame's own proportions, or the first photo's.
  const aspect = options.template ? options.template.canvasWidth / options.template.canvasHeight : photos[0].naturalWidth / photos[0].naturalHeight;
  let width = Math.min(MAX_WIDTH, options.template?.canvasWidth ?? MAX_WIDTH);
  let height = Math.round(width / aspect);
  if (height > 1280) { height = 1280; width = Math.round(height * aspect); }
  width -= width % 2;
  height -= height % 2;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof canvas.captureStream !== "function") return null;

  const holdMs = Math.max(300, Math.round((options.secondsPerPhoto || 0.9) * 1000));
  const totalMs = INTRO_MS + photos.length * holdMs + OUTRO_EXTRA_MS;
  const filter = composeFilterCss(options.filter, options.correction);

  const paint = (elapsed: number) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    const index = Math.floor((elapsed - INTRO_MS) / holdMs);
    if (index >= 0) {
      const shown = photos[Math.min(index, photos.length - 1)];
      const sinceArrival = index >= photos.length ? Infinity : elapsed - INTRO_MS - index * holdMs;
      const pop = sinceArrival < POP_MS ? 1 - sinceArrival / POP_MS : 0; // 1 → 0 over POP_MS
      const box = slot
        ? { x: slot.x * width, y: slot.y * height, w: slot.w * width, h: slot.h * height }
        : { x: 0, y: 0, w: width, h: height };
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();
      ctx.filter = filter;
      // Scale in from slightly zoomed (4 %) to rest — draws the eye to each new photo.
      const zoom = 1 + 0.04 * pop;
      ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
      ctx.scale(zoom, zoom);
      drawImageCover(ctx, shown, -box.w / 2, -box.h / 2, box.w, box.h, options.mirror);
      ctx.filter = "none";
      if (pop > 0) {
        ctx.fillStyle = `rgba(255,255,255,${0.55 * pop})`;
        ctx.fillRect(-box.w / 2, -box.h / 2, box.w, box.h);
      }
      ctx.restore();
    }
    if (frameImage) ctx.drawImage(frameImage, 0, 0, width, height);
  };

  paint(0);
  const stream = canvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: VIDEO_BITRATE });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  return new Promise<Blob | null>((resolve) => {
    recorder.onstop = () => {
      window.clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      resolve(chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null);
    };
    recorder.onerror = () => {
      window.clearInterval(timer);
      resolve(null);
    };
    const startedAt = performance.now();
    recorder.start(250);
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      options.onProgress?.(Math.min(1, elapsed / totalMs));
      if (elapsed >= totalMs) {
        window.clearInterval(timer);
        paint(totalMs);
        recorder.stop();
        return;
      }
      paint(elapsed);
    }, 33);
  });
}
