// Customers open their results on phones, where WebM often won't play (iOS Safari). Prefer recording
// H.264 MP4 directly when the browser supports it; the server also converts any WebM that still arrives.
export function pickVideoMime(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  const candidates = ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
}

export const videoExtension = (mimeType: string) => (/mp4/i.test(mimeType) ? "mp4" : "webm");
