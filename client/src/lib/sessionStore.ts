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
}

export interface PhotoSticker {
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
  photoUrls: string[];
  photoEdits: Record<number, PhotoEdit>;
  currentSlot: number;
  retakeCounts: Record<number, number>;

  setSessionId: (id: string) => void;
  setPackage: (pkg: Package) => void;
  setOrientation: (o: Orientation) => void;
    setMirrorLiveView: (mirror: boolean) => void;
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
