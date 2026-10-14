import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

// Customers' phones (iOS Safari, many Android gallery apps) can't play WebM,
// which is what the kiosk's MediaRecorder produces. Every video the server
// accepts is converted to H.264/AAC MP4 (+faststart, yuv420p) before it's stored.

let cachedBinary: string | null | undefined;

function works(binary: string) {
  try {
    return spawnSync(binary, ["-version"], { timeout: 5000 }).status === 0;
  } catch {
    return false;
  }
}

// FFMPEG_PATH wins, then a system ffmpeg (the Docker image installs one — the
// ffmpeg-static binary is glibc-only and does not run on Alpine), then ffmpeg-static.
export function resolveFfmpeg(): string | null {
  if (cachedBinary !== undefined) return cachedBinary;
  const candidates: string[] = [];
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
  candidates.push("ffmpeg");
  try {
    const bundled = createRequire(import.meta.url)("ffmpeg-static") as string | null;
    if (bundled) candidates.push(bundled);
  } catch {
    // ffmpeg-static not installed — fine if a system ffmpeg exists.
  }
  cachedBinary = candidates.find(works) ?? null;
  if (!cachedBinary) console.warn("[ffmpeg] tidak ditemukan — video akan disimpan apa adanya (WebM)");
  return cachedBinary;
}

export const isMp4 = (mimetype?: string, filename?: string) => /mp4/i.test(mimetype ?? "") || /\.mp4$/i.test(filename ?? "");

/** Converts a video buffer to MP4. Returns null when ffmpeg is unavailable or fails, so callers can fall back to the original. */
export type TranscodeOptions = { maxWidth?: number; crf?: number };

export async function transcodeToMp4(input: Buffer, opts: TranscodeOptions = {}): Promise<Buffer | null> {
  const binary = resolveFfmpeg();
  if (!binary) return null;
  const dir = await mkdtemp(path.join(tmpdir(), "studiodo-vid-"));
  const inFile = path.join(dir, "in");
  const outFile = path.join(dir, "out.mp4");
  try {
    await writeFile(inFile, input);
    await new Promise<void>((resolve, reject) => {
      const args = [
        "-y", "-i", inFile,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", String(opts.crf ?? 23), "-pix_fmt", "yuv420p",
        // Even dimensions are required by yuv420p; optionally cap the width (large branding clips).
        "-vf", opts.maxWidth ? `scale='min(${opts.maxWidth},iw)':-2` : "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-movflags", "+faststart", "-an", outFile,
      ];
      const proc = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      proc.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-2000); });
      const timer = setTimeout(() => proc.kill("SIGKILL"), 240_000) // a full-session recording can run a couple of minutes;
      proc.on("error", (error) => { clearTimeout(timer); reject(error); });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}: ${stderr}`));
      });
    });
    return await readFile(outFile);
  } catch (error) {
    console.error("[ffmpeg] transcode gagal", error);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

type UploadLike = { buffer: Buffer; mimetype?: string; originalname: string };

/** For multer uploads: returns an MP4 version of the file, or the original unchanged if conversion isn't possible. MP4s from MediaRecorder are fragmented (no duration, not seekable on some phones), so they are re-encoded too. */
export async function ensureMp4Upload<T extends UploadLike>(file: T): Promise<T> {
  const mp4 = await transcodeToMp4(file.buffer);
  if (!mp4) return file;
  return { ...file, buffer: mp4, mimetype: "video/mp4", originalname: file.originalname.replace(/\.[^.]+$/, "") + ".mp4", size: mp4.length };
}
