import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Orientation } from "./sessionStore";

export type OutputPreset = "4r" | "2r" | "a4" | "square" | "custom";
export type TemplateCategory = "minimal" | "wedding" | "birthday" | "corporate" | "seasonal" | "custom";

export interface TemplateSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  aspectRatio?: number;
}

export interface LocalTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  style: string;
  orientation: Orientation;
  outputPreset: OutputPreset;
  canvasWidth: number;
  canvasHeight: number;
  frameDataUrl: string;
  slots: TemplateSlot[];
  guideColor?: string;
  guideTolerance?: number;
}

export const OUTPUT_PRESETS: Record<Exclude<OutputPreset, "custom">, { label: string; width: number; height: number }> = {
  "4r": { label: "4R (10.2 × 15.2 cm)", width: 1200, height: 1800 },
  "2r": { label: "2R (6 × 9 cm)", width: 900, height: 1350 },
  a4: { label: "A4", width: 2480, height: 3508 },
  square: { label: "Square", width: 1800, height: 1800 },
};

interface TemplateStore {
  templates: LocalTemplate[];
  addTemplate: (template: LocalTemplate) => void;
  updateTemplate: (id: string, patch: Partial<LocalTemplate>) => void;
  removeTemplate: (id: string) => void;
}

export const useTemplateLibrary = create<TemplateStore>()(
  persist(
    (set) => ({
      templates: [],
      addTemplate: (template) => set((state) => ({ templates: [...state.templates, template] })),
      updateTemplate: (id, patch) =>
        set((state) => ({ templates: state.templates.map((template) => (template.id === id ? { ...template, ...patch } : template)) })),
      removeTemplate: (id) => set((state) => ({ templates: state.templates.filter((template) => template.id !== id) })),
    }),
    { name: "studiodo-template-library" },
  ),
);
