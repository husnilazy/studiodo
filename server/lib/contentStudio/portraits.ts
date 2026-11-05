// Flat illustrated "photos" (no real people), ported from studiodo-web's landing page (components/landing/PhotoSamples.tsx)
// so mockups and printed strips look like the landing page instead of grey silhouettes.

type Look = { a: string; b: string; skin: string; hair: string; shirt: string; two?: boolean; prop?: "heart" | "star" | "glasses" };

const LOOKS: Look[] = [
  { a: "#ffd3e4", b: "#c7ceff", skin: "#f5c6a5", hair: "#2b2140", shirt: "#4f4fe8", two: true, prop: "heart" },
  { a: "#ffe3b8", b: "#ffc8de", skin: "#e9ad86", hair: "#1c1c28", shirt: "#ff6f91", prop: "star" },
  { a: "#b8f0e6", b: "#bfd8ff", skin: "#fad5b8", hair: "#6b3f2a", shirt: "#12a06f", two: true, prop: "glasses" },
  { a: "#d5ccff", b: "#bfc6ff", skin: "#d99a73", hair: "#15131f", shirt: "#ffa43a", prop: "heart" },
];

function person(x: number, s: number, look: Look, tilt = 0): string {
  return `<g transform="translate(${x} 0) rotate(${tilt} 100 200) scale(${s})" style="transform-origin:100px 200px">
    <path d="M30 220c0-34 30-52 70-52s70 18 70 52z" fill="${look.shirt}"/>
    <rect x="88" y="138" width="24" height="34" rx="10" fill="${look.skin}"/>
    <circle cx="100" cy="112" r="38" fill="${look.skin}"/>
    <path d="M60 108c-2-30 20-48 42-46 24 2 40 22 36 48-8-18-20-28-40-28-16 0-30 8-38 26z" fill="${look.hair}"/>
    <circle cx="87" cy="116" r="3.6" fill="#1b1730"/><circle cx="113" cy="116" r="3.6" fill="#1b1730"/>
    <path d="M88 130q12 12 24 0" stroke="#1b1730" stroke-width="3.4" stroke-linecap="round" fill="none"/>
    <circle cx="78" cy="127" r="6" fill="#ff8aa5" opacity=".45"/><circle cx="122" cy="127" r="6" fill="#ff8aa5" opacity=".45"/>
    ${look.prop === "glasses" ? `<g fill="none" stroke="#1b1730" stroke-width="3"><circle cx="87" cy="116" r="10"/><circle cx="113" cy="116" r="10"/><path d="M97 116h6"/></g>` : ""}
  </g>`;
}

let uid = 0;

/** A self-contained <svg> that fills (and crops, "slice") its parent box. i picks one of four looks. */
export function portraitSvg(i: number): string {
  const look = LOOKS[Math.abs(i) % LOOKS.length];
  const id = `pg${++uid}`;
  const people = look.two
    ? person(-34, 0.78, { ...look, shirt: look.hair === "#2b2140" ? "#ff6f91" : "#4f4fe8", hair: "#3a2a1c" }, -6) + person(44, 0.78, look, 6)
    : person(0, 1, look);
  const prop =
    look.prop === "heart" ? `<path d="M165 40c-6-10-20-4-14 8 3 5 14 12 14 12s11-7 14-12c6-12-8-18-14-8z" fill="#ff5a8a"/>`
    : look.prop === "star" ? `<path d="M170 28l5 11 12 2-9 8 3 12-11-6-11 6 3-12-9-8 12-2z" fill="#ffc94a"/>` : "";
  return `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${look.a}"/><stop offset="1" stop-color="${look.b}"/></linearGradient></defs><rect width="200" height="200" fill="url(#${id})"/><circle cx="40" cy="38" r="26" fill="#fff" opacity=".35"/><circle cx="170" cy="70" r="16" fill="#fff" opacity=".3"/>${people}${prop}</svg>`;
}
