import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Sticker {
  id: string;
  name: string;
  category: string;
  dataUrl: string;
}

interface StickerStore {
  stickers: Sticker[];
  addSticker: (sticker: Sticker) => void;
  removeSticker: (id: string) => void;
}

export const useStickerLibrary = create<StickerStore>()(
  persist(
    (set) => ({
      stickers: [],
      addSticker: (sticker) => set((state) => ({ stickers: [...state.stickers, sticker] })),
      removeSticker: (id) => set((state) => ({ stickers: state.stickers.filter((sticker) => sticker.id !== id) })),
    }),
    { name: "studiodo-sticker-library" },
  ),
);
