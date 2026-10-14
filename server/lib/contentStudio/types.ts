// Content Studio: Instagram decks (carousel / reel) rendered from HTML templates in STUDIODO's own visual language.

export type Mockup = "none" | "dashboard" | "qris" | "gallery" | "booth" | "queue" | "hub" | "strip";
export type SlideKind = "cover" | "feature" | "steps" | "stat" | "compare" | "cta";
export type Tone = "light" | "dark" | "indigo" | "mint";

export type Slide = {
  kind: SlideKind;
  tone?: Tone; // overrides the deck default for this slide
  eyebrow?: string; // small caps label / badge
  title: string; // "|" = line break, *word* = accent colour
  body?: string;
  mockup?: Mockup;
  note?: string; // glass pill under the mockup
  items?: string[]; // steps / compare "with" column
  itemsBefore?: string[]; // compare "without" column
  labelBefore?: string; // compare column headings (default: Tanpa sistem / Dengan STUDIODO)
  labelAfter?: string;
  stat?: { value: number; suffix?: string; prefix?: string; label: string };
  bgImage?: string; // full-bleed photo behind the slide (asset:<file>)
  images?: string[]; // uploaded asset names (asset:<file>) used by gallery/strip mockups
  seconds?: number; // reel scene length
};

export type Deck = {
  id: string;
  title: string; // internal name
  format: "carousel" | "reel";
  tone: Tone;
  handle: string; // shown on the closing slide
  caption: string;
  hashtags: string[];
  slides: Slide[];
  builtin?: boolean;
  updatedAt?: string;
};

export const FORMATS = {
  carousel: { width: 1080, height: 1350 },
  reel: { width: 1080, height: 1920 },
} as const;
