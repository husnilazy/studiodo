import { drawImageCover, loadImage } from "./output";
import { pickVideoMime } from "@/lib/videoMime";
import { composeFilterCss, type CameraFilter, type ColorCorrection } from "./sessionStore";
import type { LocalTemplate } from "./templateStore";

// Stop-motion video: every photo of the session shown one after another, each held long enough to actually look at
// (default 0.9 s) — unlike the live GIF/video clips, which loop fast. The admin can wrap it in a dedicated frame
// (a template saved in the reserved "stop motion" category, see FrameManagement.tsx); without one it is a plain
// full-bleed slideshow. The video is recorded in real time from a canvas, so a 4-photo session takes about 6 seconds.

export const STOP_MOTION_CATEGORY = "__stopmotion";

const MAX_WIDTH = 1080; // HD: a 4:5 / 2:3 frame comes out at up to 1080x1920
const INTRO_MS = 600; // empty frame first, so the first photo "arrives" instead of already being there
const OUTRO_EXTRA_MS = 900; // the last photo stays a little longer before the loop restarts
const VIDEO_BITRATE = 12_000_000;

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
  if (height > 1920) { height = 1920; width = Math.round(height * aspect); }
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
      const box = slot
        ? { x: slot.x * width, y: slot.y * height, w: slot.w * width, h: slot.h * height }
        : { x: 0, y: 0, w: width, h: height };
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();
      ctx.filter = filter;
      // Classic stop motion: each photo simply replaces the previous one, no zoom or other camera-style movement.
      drawImageCover(ctx, shown, box.x, box.y, box.w, box.h, options.mirror);
      ctx.filter = "none";
      ctx.restore();
    }
    if (frameImage) ctx.drawImage(frameImage, 0, 0, width, height);
  };

  paint(0);
  const stream = canvas.captureStream(30);
  const mimeType = pickVideoMime();
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
