import { resolveFrameUrl } from "../frameUrl.js";

type Drive = { fileId: string; viewUrl: string; downloadUrl: string; previewUrl: string };
type Row = { photoUrls: string[] | null; drivePhotoIds: Drive[] | null; stripUrl: string | null; driveStripId: string | null };

/** Display URL for a photo (thumbnail-safe). Drive files use their image preview, everything else the stored URL made absolute. */
export function displayUrls(r: Row): { photos: string[]; strip: string | null } {
  const photos = (r.photoUrls ?? []).map((u, i) => r.drivePhotoIds?.[i]?.previewUrl || resolveFrameUrl(u)).filter(Boolean);
  const strip = r.driveStripId ? `https://drive.google.com/thumbnail?id=${r.driveStripId}&sz=w1200` : r.stripUrl ? resolveFrameUrl(r.stripUrl) : null;
  return { photos, strip };
}

