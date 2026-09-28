import { create } from "zustand";
import type { LocalTemplate } from "./templateStore";

export type CameraFilter = "normal" | "bw" | "warm" | "cool" | "vintage" | "fade" | "vivid";
export interface ColorCorrection { brightness: number; contrast: number; saturation: number; }
export type Orientation = "portrait" | "landscape";

export interface Package {
  id: string;
  name: string;
  price: string;
  photoCount: number;
  hasGif: boolean;
  hasVideo: boolean;
  extraPrints?: { id: string; name: string; price: number }[];
  thumbnailUrl?: string | null;
  description?: string | null;
}

export interface PhotoSticker {
  // Unique per PLACED sticker — distinct from stickerId (which asset it
  // renders), so adding the same library sticker twice gives two independently
  // movable/resizable/removable instances instead of two entries that collide
  // whenever one of them is dragged or resized.
  id: string;
  stickerId: string;
  x: number;
  y: number;
  scale: number;
}

export interface PhotoEdit {
  zoom: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
}

interface KioskSessionState {
  sessionId: string | null;
  selectedPackage: Package | null;
  orientation: Orientation;
  mirrorLiveView: boolean;
  // Separate from mirrorLiveView (which only ever flips the on-screen video
  // during capture — the actual saved photoUrls are always raw/unflipped
  // camera frames). This is the customer's choice, made at PreviewFoto, for
  // whether the final composited output (frame/strip burn-in AND the
  // printed copy) should be flipped to match what they saw in the mirror-
  // style live view, or left as the camera's true capture. Defaults to
  // mirrored since customers expect the print to match what they saw
  // posing in front of the (mirrored) live view.
  outputMirrored: boolean;
  filter: CameraFilter;
  colorCorrection: ColorCorrection;
  frameId: string | null;
  selectedTemplateId: string | null;
  selectedTemplateData: LocalTemplate | null;
  outputPreset: string;
  photoStickers: PhotoSticker[];
  templatePhotoMap: Record<number, number>;
  selectedExtras: { id: string; name: string; price: number }[];
  sessionStartedAt: number | null;
  mediaUrl: string | null;
  mediaUrls: string[];
  // Short clip captured at each individual photo shot, indexed the same as
  // photoUrls — separate from mediaUrl(s), which is the combined "every slot
  // animating at once" output.
  slotClipUrls: (string | null)[];
  photoUrls: string[];
  photoEdits: Record<number, PhotoEdit>;
  currentSlot: number;
  retakeCounts: Record<number, number>;

  setSessionId: (id: string) => void;
  setPackage: (pkg: Package) => void;
  setOrientation: (o: Orientation) => void;
    setMirrorLiveView: (mirror: boolean) => void;
  setOutputMirrored: (mirror: boolean) => void;
  setFilter: (f: CameraFilter) => void;
  setColorCorrection: (value: ColorCorrection) => void;
  setFrameId: (id: string | null) => void;
  setSelectedTemplateId: (id: string | null) => void;
  setSelectedTemplateData: (template: LocalTemplate | null) => void;
  setOutputPreset: (preset: string) => void;
  setPhotoStickers: (stickers: PhotoSticker[]) => void;
  setTemplatePhotoMap: (map: Record<number, number>) => void;
  setSelectedExtras: (extras: { id: string; name: string; price: number }[]) => void;
  setMediaUrl: (url: string) => void;
  setSlotClipUrl: (slot: number, url: string) => void;
  setPhotoEdit: (slot: number, edit: PhotoEdit) => void;
  beginSessionTimer: () => void;
  setPhotoAtSlot: (slot: number, url: string) => void;
  setCurrentSlot: (slot: number) => void;
  incrementRetake: (slot: number) => boolean;
  resetSession: () => void;
}

const initial = {
  sessionId: null,
  selectedPackage: null,
  orientation: "portrait" as Orientation,
    mirrorLiveView: true,
  outputMirrored: true,
  filter: "normal" as CameraFilter,
  colorCorrection: { brightness: 100, contrast: 100, saturation: 100 },
  frameId: null,
  selectedTemplateId: null,
  selectedTemplateData: null,
  outputPreset: "4r",
  photoStickers: [],
  templatePhotoMap: {},
  selectedExtras: [],
  sessionStartedAt: null,
  mediaUrl: null,
  mediaUrls: [] as string[],
  slotClipUrls: [] as (string | null)[],
  photoUrls: [] as string[],
  photoEdits: {},
  currentSlot: 0,
  retakeCounts: {},
};

export const useKioskSession = create<KioskSessionState>((set) => ({
  ...initial,
  setSessionId: (id) => set({ sessionId: id }),
  setPackage: (pkg) => set({ selectedPackage: pkg }),
  setOrientation: (o) => set({ orientation: o }),
    setMirrorLiveView: (mirrorLiveView) => set({ mirrorLiveView }),
  setOutputMirrored: (outputMirrored) => set({ outputMirrored }),
  setFilter: (f) => set({ filter: f }),
  setColorCorrection: (colorCorrection) => set({ colorCorrection }),
  setFrameId: (id) => set({ frameId: id }),
  setSelectedTemplateId: (id) => set({ selectedTemplateId: id }),
  setSelectedTemplateData: (selectedTemplateData) => set({ selectedTemplateData }),
  setOutputPreset: (preset) => set({ outputPreset: preset }),
  setPhotoStickers: (photoStickers) => set({ photoStickers }),
  setTemplatePhotoMap: (templatePhotoMap) => set({ templatePhotoMap }),
  setSelectedExtras: (selectedExtras) => set({ selectedExtras }),
  setMediaUrl: (mediaUrl) => set((state) => ({ mediaUrl, mediaUrls: [...state.mediaUrls, mediaUrl] })),
  setSlotClipUrl: (slot, url) =>
    set((state) => {
      const slotClipUrls = [...state.slotClipUrls];
      slotClipUrls[slot] = url;
      return { slotClipUrls };
    }),
  setPhotoEdit: (slot, edit) => set((state) => ({ photoEdits: { ...state.photoEdits, [slot]: edit } })),
  beginSessionTimer: () => set((state) => ({ sessionStartedAt: state.sessionStartedAt ?? Date.now() })),
  setPhotoAtSlot: (slot, url) =>
    set((s) => {
      const photoUrls = [...s.photoUrls];
      photoUrls[slot] = url;
      return { photoUrls };
    }),
  setCurrentSlot: (slot) => set({ currentSlot: slot }),
  incrementRetake: (slot) => {
    const current = useKioskSession.getState().retakeCounts[slot] ?? 0;
    if (current >= 3) return false;
    set((state) => ({ retakeCounts: { ...state.retakeCounts, [slot]: current + 1 } }));
    return true;
  },
  resetSession: () => set({ ...initial, photoUrls: [], photoEdits: {}, templatePhotoMap: {} }),
}));

export const FILTER_LABELS: Record<CameraFilter, string> = {
  normal: "Normal",
  bw: "B&W",
  warm: "Warm",
  cool: "Cool",
  vintage: "Vintage",
  fade: "Fade",
  vivid: "Vivid",
};

/** CSS filter string baked live onto the viewfinder, and burned into the captured canvas frame. */
export const FILTER_CSS: Record<CameraFilter, string> = {
  normal: "none",
  bw: "grayscale(1) contrast(1.05)",
  warm: "sepia(0.25) saturate(1.3) hue-rotate(-8deg)",
  cool: "saturate(1.15) hue-rotate(8deg) brightness(1.03)",
  vintage: "sepia(0.4) contrast(0.9) saturate(0.85) brightness(1.05)",
  fade: "contrast(0.85) saturate(0.7) brightness(1.1)",
  vivid: "saturate(1.6) contrast(1.15)",
};

/**
 * Composes a filter's CSS with brightness/contrast/saturation correction into
 * one valid `filter` value. FILTER_CSS.normal is the literal keyword "none",
 * and per the CSS filter spec "none" is only valid on its own — a naive
 * `${FILTER_CSS[filter]} brightness(...)` template silently produces an
 * invalid value (e.g. "none brightness(120%)") whenever "Normal" is the
 * active filter, which both canvas ctx.filter and the DOM style property
 * simply ignore, so every correction slider looked broken by default.
 */
export function composeFilterCss(filter: CameraFilter, correction: ColorCorrection): string {
  const parts: string[] = [];
  if (FILTER_CSS[filter] !== "none") parts.push(FILTER_CSS[filter]);
  if (correction.brightness !== 100) parts.push(`brightness(${correction.brightness}%)`);
  if (correction.contrast !== 100) parts.push(`contrast(${correction.contrast}%)`);
  if (correction.saturation !== 100) parts.push(`saturate(${correction.saturation}%)`);
  return parts.length > 0 ? parts.join(" ") : "none";
}
