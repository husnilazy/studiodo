// Screen builder — shared types between the runtime kiosk render path and the admin editor.
// Mirrors server/routes/screenLayouts.ts's shape.
//
// Two kinds of element:
//  • "page elements" — drawn by the screen itself (title, buttons, step list …). The builder can MOVE and SCALE them (and
//    hide the optional ones) but never stretches them, so their text can't be squashed into a tiny box.
//  • "custom elements" (id starts with "custom-") — added by the admin: text, picture, video/GIF, running logo.
export type ElementType = "system-button" | "text" | "system-steplist" | "image" | "marquee" | "video";

export interface LayoutElement {
  id: string;
  type: ElementType;
  /** Position of the top-left corner, in % of the screen. */
  xPct: number;
  yPct: number;
  /** Size in % of the screen — used by custom elements only (page elements size themselves, see `scale`). */
  widthPct: number;
  heightPct: number;
  zIndex: number;
  fontSizeVw?: number;
  /** Text of a custom text element / the words of a running text. */
  content?: string;
  /** File of a custom picture, video or running logo (URL once saved). */
  src?: string;
  /** Size multiplier of a page element (1 = normal). */
  scale?: number;
  /** Degrees, custom elements only. */
  rotation?: number;
  /** 0–100 */
  opacity?: number;
  hidden?: boolean;
  color?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  fit?: "contain" | "cover";
  /** Corner rounding in % of the element's shorter side (0–100). */
  radius?: number;
  /** Running logo: seconds for one full pass. */
  speed?: number;
  reverse?: boolean;
}

export interface RegisteredElement {
  id: string;
  type: ElementType;
  label: string;
}

export type ScreenOrientation = "portrait" | "landscape";

export const isCustomId = (id: string) => id.startsWith("custom-");
