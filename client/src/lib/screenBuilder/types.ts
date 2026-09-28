// WYSIWYG screen builder (Fase 5a) — shared types between the runtime kiosk
// render path and the admin editor. Mirrors server/routes/screenLayouts.ts's shape.
export type ElementType = "system-button" | "text" | "system-steplist" | "image";

export interface LayoutElement {
  id: string;
  type: ElementType;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  zIndex: number;
  fontSizeVw?: number;
  /** Only set for admin-added custom elements (id starts with "custom-") —
   * an image data URL for type "image", or literal text for type "text".
   * Elements that reposition something already coded into the page never
   * set this; their content comes from the page's own JSX. */
  content?: string;
}

export interface RegisteredElement {
  id: string;
  type: ElementType;
  label: string;
}

export type ScreenOrientation = "portrait" | "landscape";
