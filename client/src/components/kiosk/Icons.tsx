// Small stroke icon set for the kiosk and admin UI (24×24 grid, currentColor). One place, so every screen draws
// the same crisp icons instead of mixing emoji and ad-hoc SVGs.
const PATHS: Record<string, string> = {
  camera: "M4 8h3l2-3h6l2 3h3v11H4z M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  image: "M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M9 9.5h.01",
  gif: "M3 6h18v12H3z M8.5 10.5H7a1.5 1.5 0 0 0 0 3h1.5V12 M12 10v4 M15 14v-4h3 M15 12h2",
  video: "M3 6h12v12H3z M15 10l6-3v10l-6-3",
  printer: "M7 9V3h10v6 M7 17H4v-6h16v6h-3 M7 14h10v7H7z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  "arrow-left": "M19 12H5 M11 6l-6 6 6 6",
  "arrow-right": "M5 12h14 M13 6l6 6-6 6",
  qr: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M20 14v.01 M14 20h3 M20 17v4",
  ticket: "M3 8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4z M14 7v10",
  cash: "M3 7h18v10H3z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M6.5 10v.01 M17.5 14v.01",
  sparkles: "M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0",
  mail: "M3 6h18v12H3z M3 7l9 6 9-6",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  download: "M12 3v12 M7 11l5 5 5-5 M4 20h16",
  refresh: "M4 12a8 8 0 0 1 13.66-5.66L20 8.5 M20 12a8 8 0 0 1-13.66 5.66L4 15.5 M20 4v4.5h-4.5 M4 20v-4.5h4.5",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  x: "M6 6l12 12 M18 6L6 18",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  sticker: "M12 3a9 9 0 1 0 9 9c0-.5-.03-1-.1-1.5H15a3.5 3.5 0 0 1-3.5-3.5V3.1c-.5-.07-1-.1-1.5-.1z M14.5 3.5c.4 2.6 2.4 4.6 5 5 M8.5 13.5h.01 M12 16.5c1.5.8 3 .8 4 0",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8.5 14a4.5 4.5 0 0 0 7 0 M9 9.5h.01 M15 9.5h.01",
  sliders: "M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 4v6 M9 14v6",
  frame: "M4 3h16v18H4z M4 9h16 M9 3v6",
  home: "M4 11l8-7 8 7 M6 10v10h12V10 M10 20v-5h4v5",
  mirror: "M12 3v18 M8 7L3 12l5 5z M16 7l5 5-5 5z",
  scan: "M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M4 12h16",
  undo: "M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3",
  copy: "M8 8h12v12H8z M4 16V4h12",
  layers: "M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17.5l9 5 9-5",
  rotate: "M20 12a8 8 0 1 1-2.34-5.66L20 8.5 M20 4v4.5h-4.5",
  zoom: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M10.5 8v5 M8 10.5h5 M20 20l-4.3-4.3",
  palette: "M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.2.2-2.5 1.5-2.5H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.5z M7.5 11h.01 M10 7.5h.01 M14.5 7.5h.01",
  warning: "M12 3l10 18H2z M12 10v5 M12 18v.01",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8v.01",
  share: "M8 12l8-5 M8 12l8 5 M6 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2",
};

export type IconName = keyof typeof PATHS | (string & {});

export function Icon({ name, className = "h-5 w-5", strokeWidth = 1.8 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.sparkles} />
    </svg>
  );
}
