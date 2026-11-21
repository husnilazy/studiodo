// Illustration kit for the "kaca" style: flat vector people with real expressions (bingung, kaget, senang, khawatir…), props and
// twelve ready scenes. Every colour that matters comes from the deck theme (var(--c1..c3)), so one scene looks right in all five
// themes. Pure SVG strings + CSS classes (.a-float / .a-pop / .a-shake / .a-blink) so the renderer can seek to any frame.
// Same look as portraits.ts (round head, dot eyes, rosy cheeks): friendly, not photoreal.

export type Expr = "bingung" | "kaget" | "senang" | "khawatir" | "berpikir" | "lega";
export type Pose = "down" | "hold" | "up" | "chin" | "point";
export type Hair = "short" | "long" | "bun" | "hijab" | "curly";
export const SCENES = ["kasir", "scan", "error", "antrean", "offline", "omzet", "kamera", "cetak", "desain", "aman", "mulai", "hasil", "chat"] as const;
export type SceneId = (typeof SCENES)[number];

const INK = "#1b1730";
const SKINS = ["#f5c6a5", "#e9ad86", "#d99a73", "#b9805a"];
const HAIRS = ["#2b2140", "#1c1c28", "#6b3f2a", "#15131f"];
const f = (c: string, o = 1) => `style="fill:${c};opacity:${o}"`;
const stroke = (c: string, w: number) => `style="fill:none;stroke:${c};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round"`;
const g = (x: number, y: number, s: number, inner: string, cls = "", d = 0, extra = "") =>
  `<g transform="translate(${x} ${y}) scale(${s})"><g class="${cls}" style="--d:${d}s;transform-box:fill-box;transform-origin:50% 100%${extra}">${inner}</g></g>`;

type PersonOpts = { x: number; y: number; s?: number; expr: Expr; pose?: Pose; skin?: number; hair?: Hair; hairColor?: number; top?: string; flip?: boolean; d?: number; cls?: string };

/** One character. (x, y) is the centre of the head; ~330 units tall at s=1. */
export function person(o: PersonOpts): string {
  const skin = SKINS[(o.skin ?? 0) % SKINS.length], hairC = HAIRS[(o.hairColor ?? 0) % HAIRS.length], top = o.top ?? "var(--c1)";
  const hair = o.hair ?? "short", pose = o.pose ?? "down", e = o.expr;
  const arm = (d: string, hx: number, hy: number) => `<path d="${d}" style="fill:none;stroke:${top};stroke-width:28;stroke-linecap:round;filter:brightness(1.3)"/><circle cx="${hx}" cy="${hy}" r="14" ${f(skin)}/>`;
  const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, a, b) => `${-Number(a)} ${b}`);
  const poses: Record<Pose, string> = {
    down: arm("M-44 84 Q-64 150 -52 212", -52, 216) + arm("M44 84 Q64 150 52 212", 52, 216),
    hold: arm("M-44 84 Q-62 150 -20 176", -18, 176) + arm("M44 84 Q66 140 22 160", 18, 160),
    up: arm("M-44 84 Q-96 50 -40 8", -38, 4) + arm(mirror("M-44 84 Q-96 50 -40 8"), 38, 4),
    chin: arm("M-44 84 Q-64 150 -52 212", -52, 216) + arm("M44 84 Q96 56 14 48", 12, 46),
    point: arm("M-44 84 Q-64 150 -52 212", -52, 216) + arm("M44 84 Q104 80 142 34", 146, 30),
  };
  const hairBack = hair === "long" ? `<rect x="-50" y="-14" width="18" height="86" rx="9" ${f(hairC)}/><rect x="32" y="-14" width="18" height="86" rx="9" ${f(hairC)}/>` : "";
  const hairTop =
    hair === "bun" ? `<circle cx="0" cy="-54" r="17" ${f(hairC)}/>` : "";
  const cap = `<path d="M-43 -2 C-48 -58 48 -58 43 -2 C34 -26 14 -34 0 -34 C-14 -34 -34 -26 -43 -2Z" ${f(hairC)}/>`;
  const curls = hair === "curly" ? [-34, -17, 0, 17, 34].map((cx, i) => `<circle cx="${cx}" cy="${-30 - (i % 2) * 6}" r="14" ${f(hairC)}/>`).join("") : "";
  const hijab = hair === "hijab";
  const head = hijab
    ? `<path d="M-56 4 C-56 -56 56 -56 56 4 C56 40 72 72 68 100 Q0 126 -68 100 C-72 72 -56 40 -56 4Z" ${f("var(--c3)")}/><ellipse cx="0" cy="4" rx="35" ry="38" ${f(skin)}/>`
    : `<circle cx="0" cy="0" r="42" ${f(skin)}/>${hair === "curly" ? curls : cap}${hairTop}`;
  const eyes = e === "senang" || e === "lega" ? `<path d="M-22 4 Q-15 -4 -8 4M8 4 Q15 -4 22 4" ${stroke(INK, 3.4)}/>`
    : e === "kaget" ? `<circle cx="-15" cy="2" r="8.5" ${f("#fff")}/><circle cx="15" cy="2" r="8.5" ${f("#fff")}/><circle cx="-15" cy="2" r="3.8" ${f(INK)}/><circle cx="15" cy="2" r="3.8" ${f(INK)}/>`
    : `<circle cx="-15" cy="2" r="4.6" ${f(INK)}/><circle cx="15" cy="2" r="4.6" ${f(INK)}/>`;
  const brows: Record<Expr, string> = {
    bingung: `<path d="M-24 -13 Q-15 -20 -6 -13M7 -15 L24 -9" ${stroke(INK, 3.4)}/>`,
    kaget: `<path d="M-23 -17 Q-15 -26 -7 -17M7 -17 Q15 -26 23 -17" ${stroke(INK, 3.4)}/>`,
    senang: `<path d="M-22 -12 Q-15 -17 -8 -12M8 -12 Q15 -17 22 -12" ${stroke(INK, 3.2)}/>`,
    khawatir: `<path d="M-25 -8 L-7 -17M25 -8 L7 -17" ${stroke(INK, 3.4)}/>`,
    berpikir: `<path d="M-24 -10 L-6 -10M8 -16 Q16 -22 24 -16" ${stroke(INK, 3.4)}/>`,
    lega: `<path d="M-22 -11 Q-15 -15 -8 -11M8 -11 Q15 -15 22 -11" ${stroke(INK, 3)}/>`,
  };
  const mouths: Record<Expr, string> = {
    bingung: `<path d="M-13 26 Q-6 19 0 26 T13 26" ${stroke(INK, 3.4)}/>`,
    kaget: `<ellipse cx="0" cy="27" rx="6.5" ry="9" ${f(INK)}/>`,
    senang: `<path d="M-17 18 Q0 38 17 18Z" ${f(INK)}/><path d="M-9 26 Q0 33 9 26" ${f("#ff8aa5")}/>`,
    khawatir: `<path d="M-12 30 Q0 19 12 30" ${stroke(INK, 3.4)}/>`,
    berpikir: `<path d="M-9 27 H9" ${stroke(INK, 3.4)}/>`,
    lega: `<path d="M-11 22 Q0 32 11 22" ${stroke(INK, 3.4)}/>`,
  };
  const cheeks = `<circle cx="-26" cy="16" r="6.5" ${f("#ff8aa5", 0.45)}/><circle cx="26" cy="16" r="6.5" ${f("#ff8aa5", 0.45)}/>`;
  const extra =
    e === "khawatir" ? `<path d="M40 -26 q8 12 0 17 q-8 -5 0 -17z" ${f("#8ad8ff")} class="a-blink" style="--d:${o.d ?? 0}s"/>`
    : e === "bingung" ? `<text x="52" y="-34" font-family="Bricolage,system-ui,sans-serif" font-weight="800" font-size="62" ${f("var(--c3)")} class="a-float">?</text>`
    : e === "kaget" ? `<text x="52" y="-34" font-family="Bricolage,system-ui,sans-serif" font-weight="800" font-size="62" ${f("var(--c3)")} class="a-shake">!</text>`
    : e === "berpikir" ? `<g ${f("var(--c3)", 0.9)}><circle cx="58" cy="-30" r="5"/><circle cx="72" cy="-46" r="8"/><circle cx="94" cy="-68" r="13"/></g>` : "";
  const faceY = hijab ? 2 : 0;
  const body = `<rect x="-52" y="56" width="104" height="200" rx="48" ${f(top)}/><rect x="-12" y="34" width="24" height="34" rx="10" ${f(skin)}/>${poses[pose]}${hairBack}${head}<g transform="translate(0 ${faceY})">${eyes}${brows[e]}${mouths[e]}${cheeks}${extra}</g>`;
  return g(o.x, o.y, (o.s ?? 1) * (o.flip ? 1 : 1), o.flip ? `<g transform="scale(-1 1)">${body}</g>` : body, o.cls ?? "a-float", o.d ?? 0);
}

// ------------------------------------------------------------------ props ----
const dark = "#12162b";
export function qr(x: number, y: number, size: number, seed = 3): string {
  const n = 9, c = size / n; let cells = "";
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
    const finder = (r < 3 && k < 3) || (r < 3 && k > 5) || (r > 5 && k < 3);
    if (finder) continue;
    if (((r * 7 + k * 13 + seed * 5) % 5) < 2) cells += `<rect x="${k * c}" y="${r * c}" width="${c - 1}" height="${c - 1}" rx="1.5"/>`;
  }
  const fin = (fx: number, fy: number) => `<rect x="${fx * c}" y="${fy * c}" width="${3 * c - 1}" height="${3 * c - 1}" rx="4"/><rect x="${fx * c + c * 0.8}" y="${fy * c + c * 0.8}" width="${c * 1.4}" height="${c * 1.4}" rx="2" style="fill:#fff"/>`;
  return `<g transform="translate(${x} ${y})" style="fill:${dark}"><rect x="-8" y="-8" width="${size + 16}" height="${size + 16}" rx="14" style="fill:#fff"/>${cells}${fin(0, 0)}${fin(6, 0)}${fin(0, 6)}</g>`;
}
export const phone = (x: number, y: number, s: number, screen: "qr" | "chart" | "notif" | "photo" | "chat", cls = "a-float", d = 0) => g(x, y, s, `
  <rect x="-44" y="-84" width="88" height="168" rx="16" ${f(dark)}/><rect x="-37" y="-76" width="74" height="152" rx="10" ${f("#fff")}/>
  ${screen === "qr" ? qr(-26, -44, 52, 2) : screen === "chart" ? `<rect x="-28" y="20" width="12" height="34" rx="3" ${f("var(--c1)")}/><rect x="-10" y="4" width="12" height="50" rx="3" ${f("var(--c2)")}/><rect x="8" y="-16" width="12" height="70" rx="3" ${f("var(--c3)")}/><path d="M-28 -30 H20" ${stroke(dark, 5)}/><path d="M-28 -44 H-4" ${stroke("#b9bdd4", 5)}/>`
    : screen === "notif" ? `<rect x="-30" y="-56" width="60" height="26" rx="8" ${f("var(--c2)", 0.9)}/><rect x="-30" y="-24" width="60" height="26" rx="8" ${f("var(--c1)", 0.85)}/><rect x="-30" y="8" width="60" height="26" rx="8" ${f("var(--c3)")}/>`
    : screen === "photo" ? `<rect x="-30" y="-58" width="29" height="38" rx="6" ${f("var(--c2)")}/><rect x="1" y="-58" width="29" height="38" rx="6" ${f("var(--c3)")}/><rect x="-30" y="-16" width="29" height="38" rx="6" ${f("var(--c3)")}/><rect x="1" y="-16" width="29" height="38" rx="6" ${f("var(--c1)")}/><path d="M-12 44 h24" ${stroke(dark, 6)}/>`
    : `<rect x="-30" y="-58" width="42" height="20" rx="8" ${f("#e7e9f6")}/><rect x="-12" y="-30" width="42" height="20" rx="8" ${f("var(--c1)")}/><rect x="-30" y="-2" width="34" height="20" rx="8" ${f("#e7e9f6")}/>`}
`, cls, d);
export const kiosk = (x: number, y: number, s: number, mode: "qr" | "error" | "ok" | "photo" | "idle", d = 0) => g(x, y, s, `
  <rect x="-80" y="-170" width="160" height="340" rx="26" ${f(dark)}/><rect x="-66" y="-150" width="132" height="190" rx="14" ${f(mode === "error" ? "#2a1020" : "#fff")}/>
  ${mode === "qr" ? qr(-40, -122, 80, 4) : mode === "error" ? `<path d="M0 -118 L44 -52 H-44Z" ${f("#ff4d6d")}/><rect x="-4" y="-100" width="8" height="26" rx="4" ${f("#fff")}/><circle cx="0" cy="-62" r="5" ${f("#fff")}/>`
    : mode === "ok" ? `<circle cx="0" cy="-86" r="40" ${f("var(--c2)")}/><path d="M-18 -86 L-5 -72 L20 -102" ${stroke("#fff", 9)}/>`
    : mode === "photo" ? `<rect x="-50" y="-132" width="48" height="56" rx="8" ${f("var(--c2)")}/><rect x="2" y="-132" width="48" height="56" rx="8" ${f("var(--c3)")}/><rect x="-50" y="-70" width="48" height="56" rx="8" ${f("var(--c3)")}/><rect x="2" y="-70" width="48" height="56" rx="8" ${f("var(--c1)")}/>`
    : `<rect x="-44" y="-126" width="88" height="14" rx="7" ${f("#d9dcef")}/><rect x="-44" y="-100" width="88" height="40" rx="10" ${f("var(--c2)", 0.5)}/>`}
  <circle cx="0" cy="68" r="14" ${f("var(--c2)")}/><rect x="-44" y="104" width="88" height="40" rx="10" ${f("#232a4a")}/>
`, "a-pop", d);
export const wifi = (x: number, y: number, s: number, off: boolean, d = 0) => g(x, y, s, `<path d="M-46 -8 Q0 -52 46 -8M-30 12 Q0 -14 30 12" ${stroke(off ? "#8d93b3" : "var(--c3)", 10)}/><circle cx="0" cy="34" r="8" ${f(off ? "#8d93b3" : "var(--c3)")}/>${off ? `<path d="M-52 56 L52 -44" ${stroke("#ff4d6d", 11)}/>` : ""}`, off ? "a-blink" : "a-pop", d);
export const warn = (x: number, y: number, s: number, d = 0) => g(x, y, s, `<path d="M0 -50 L52 40 H-52Z" ${f("#ffb02e")} /><rect x="-5" y="-22" width="10" height="34" rx="5" ${f(dark)}/><circle cx="0" cy="26" r="6" ${f(dark)}/>`, "a-shake", d);
export const okBadge = (x: number, y: number, s: number, d = 0) => g(x, y, s, `<circle r="40" ${f("var(--c2)")}/><path d="M-18 0 L-5 14 L20 -14" ${stroke("#fff", 9)}/>`, "a-pop", d);
export const coins = (x: number, y: number, s: number, d = 0) => g(x, y, s, `<ellipse cx="0" cy="30" rx="40" ry="12" ${f("var(--c3)")}/><rect x="-40" y="6" width="80" height="24" ${f("var(--c3)")}/><ellipse cx="0" cy="6" rx="40" ry="12" ${f("#ffe58a")}/><ellipse cx="0" cy="-16" rx="40" ry="12" ${f("#ffd23f")}/><rect x="-40" y="-16" width="80" height="22" ${f("#ffd23f")}/><ellipse cx="0" cy="-16" rx="40" ry="12" ${f("#ffe58a")}/>`, "a-pop", d);
export const clock = (x: number, y: number, s: number, d = 0) => g(x, y, s, `<circle r="44" ${f("#fff")}/><circle r="44" ${stroke(dark, 7)}/><path d="M0 -26 V0 L18 12" ${stroke(dark, 7)}/>`, "a-pop", d);
export const lock = (x: number, y: number, s: number, d = 0) => g(x, y, s, `<path d="M-24 -4 V-28 a24 24 0 0 1 48 0 V-4" ${stroke("var(--c3)", 12)}/><rect x="-40" y="-6" width="80" height="62" rx="14" ${f("var(--c2)")}/><circle cx="0" cy="22" r="8" ${f(dark)}/>`, "a-pop", d);
export const shield = (x: number, y: number, s: number, d = 0) => g(x, y, s, `<path d="M0 -60 L52 -40 V8 Q52 46 0 66 Q-52 46 -52 8 V-40Z" ${f("var(--c2)")}/><path d="M-20 4 L-6 18 L22 -14" ${stroke("#fff", 10)}/>`, "a-pop", d);
export const camera = (x: number, y: number, s: number, d = 0) => g(x, y, s, `<rect x="-60" y="-34" width="120" height="80" rx="16" ${f(dark)}/><rect x="-26" y="-48" width="52" height="18" rx="6" ${f(dark)}/><circle cx="0" cy="6" r="30" ${f("#2c3563")}/><circle cx="0" cy="6" r="19" ${f("var(--c2)")}/><circle cx="8" cy="-2" r="6" ${f("#fff", 0.8)}/>`, "a-pop", d);
export const sliders = (x: number, y: number, s: number, d = 0) => g(x, y, s, [0, 1, 2].map((i) => `<rect x="-62" y="${-34 + i * 32}" width="124" height="10" rx="5" ${f("#fff", 0.35)}/><circle cx="${-30 + ((i * 37) % 70)}" cy="${-29 + i * 32}" r="13" ${f("var(--c3)")}/>`).join(""), "a-pop", d);
export const strip = (x: number, y: number, s: number, rot = 0, d = 0) => g(x, y, s, `<g transform="rotate(${rot})"><rect x="-38" y="-120" width="76" height="240" rx="8" ${f("#fff")}/>${[0, 1, 2, 3].map((i) => `<rect x="-30" y="${-110 + i * 56}" width="60" height="48" rx="5" ${f(["var(--c1)", "var(--c2)", "var(--c3)", "var(--c2)"][i], 0.9)}/><circle cx="0" cy="${-92 + i * 56}" r="8" ${f("#fff", 0.85)}/>`).join("")}</g>`, "a-pop", d);
export const printer = (x: number, y: number, s: number, d = 0) => g(x, y, s, `<rect x="-70" y="-10" width="140" height="64" rx="16" ${f(dark)}/><rect x="-50" y="-52" width="100" height="48" rx="6" ${f("#fff")}/><rect x="-44" y="30" width="88" height="8" rx="4" ${f("var(--c3)")}/><circle cx="52" cy="14" r="5" ${f("var(--c2)")}/>`, "a-pop", d);
export const frames = (x: number, y: number, s: number, d = 0) => g(x, y, s, `<rect x="-70" y="-60" width="84" height="110" rx="10" ${f("var(--c1)")} transform="rotate(-8)"/><rect x="-30" y="-70" width="84" height="110" rx="10" ${f("var(--c2)")} transform="rotate(5)"/><rect x="-6" y="-50" width="84" height="110" rx="10" ${f("var(--c3)")} transform="rotate(14)"/>`, "a-pop", d);
export const bubble = (x: number, y: number, s: number, who: "them" | "us", d = 0) => g(x, y, s, `<rect x="-60" y="-30" width="120" height="60" rx="22" ${f(who === "us" ? "var(--c2)" : "#fff")}/><path d="${who === "us" ? "M40 26 L56 46 L20 30Z" : "M-40 26 L-56 46 L-20 30Z"}" ${f(who === "us" ? "var(--c2)" : "#fff")}/><circle cx="-20" cy="0" r="6" ${f(who === "us" ? "#fff" : dark)}/><circle cx="0" cy="0" r="6" ${f(who === "us" ? "#fff" : dark)}/><circle cx="20" cy="0" r="6" ${f(who === "us" ? "#fff" : dark)}/>`, "a-pop", d);
export const sparkle = (x: number, y: number, s: number, d = 0) => g(x, y, s, `<path d="M0 -26 Q4 -4 26 0 Q4 4 0 26 Q-4 4 -26 0 Q-4 -4 0 -26Z" ${f("var(--c3)")}/>`, "a-pop", d);
export const rocket = (x: number, y: number, s: number, d = 0) => g(x, y, s, `<path d="M0 -70 Q34 -34 28 24 H-28 Q-34 -34 0 -70Z" ${f("#fff")}/><circle cx="0" cy="-20" r="13" ${f("var(--c2)")}/><path d="M-28 4 L-52 36 L-28 28Z M28 4 L52 36 L28 28Z" ${f("var(--c1)")}/><path d="M-12 30 Q0 74 12 30Z" ${f("#ffb02e")}/>`, "a-float", d);
export const checklist = (x: number, y: number, s: number, d = 0) => g(x, y, s, `<rect x="-52" y="-66" width="104" height="132" rx="14" ${f("#fff")}/>${[0, 1, 2].map((i) => `<circle cx="-30" cy="${-34 + i * 34}" r="9" ${f("var(--c2)")}/><path d="M-35 ${-34 + i * 34} l4 5 l8 -9" ${stroke("#fff", 3)}/><rect x="-14" y="${-39 + i * 34}" width="50" height="10" rx="5" ${f("#d9dcef")}/>`).join("")}`, "a-pop", d);
const blob = (c: string, cx = 400, cy = 330) => `<ellipse cx="${cx}" cy="${cy}" rx="300" ry="250" ${f(c, 0.16)}/><ellipse cx="${cx}" cy="560" rx="220" ry="22" ${f("#000", 0.28)}/>`;

// ------------------------------------------------------------------ scenes ----
type Cfg = { expr?: Expr; hair?: Hair; skin?: number; flip?: boolean };

/** A complete 800x600 scene. `cfg` can override the main person's expression/look so the same scene serves different problems. */
export function scene(id: SceneId, cfg: Cfg = {}): string {
  const p = (o: Partial<PersonOpts> & { expr: Expr }) => person({ x: 400, y: 190, hair: cfg.hair ?? "short", skin: cfg.skin ?? 1, ...o, expr: cfg.expr ?? o.expr });
  let inner = "";
  switch (id) {
    case "kasir": inner = blob("var(--c1)") + phone(600, 330, 1.25, "notif", "a-float", 0.4) + p({ x: 290, expr: "bingung", pose: "chin", hair: "hijab" }) + clock(150, 130, 0.9, 0.2) + coins(640, 520, 0.9, 0.5); break;
    case "scan": inner = blob("var(--c2)") + kiosk(580, 300, 1.2, "qr") + p({ x: 270, expr: "senang", pose: "hold", hair: "bun" }) + phone(265, 360, 1.1, "qr", "a-float", 0.2) + sparkle(110, 120, 0.9, 0.5) + sparkle(700, 90, 0.7, 0.7); break;
    case "error": inner = blob("var(--c1)") + kiosk(570, 300, 1.2, "error") + p({ x: 270, expr: "khawatir", pose: "up", hair: "short", skin: 2 }) + warn(690, 110, 1, 0.3) + bubble(150, 110, 0.9, "them", 0.6); break;
    case "antrean": inner = blob("var(--c3)") + kiosk(620, 300, 1.05, "idle") + p({ x: 160, y: 200, s: 0.85, expr: "khawatir", pose: "down", hair: "long", skin: 1 }) + p({ x: 300, y: 215, s: 0.8, expr: "bingung", pose: "chin", hair: "curly", skin: 2, top: "var(--c2)", d: 0.2 }) + p({ x: 430, y: 225, s: 0.75, expr: "berpikir", pose: "down", skin: 3, top: "var(--c3)", d: 0.4 }) + clock(110, 90, 0.9, 0.3); break;
    case "offline": inner = blob("var(--c1)") + kiosk(560, 300, 1.15, "ok") + p({ x: 260, expr: "lega", pose: "down", hair: "short" }) + wifi(130, 110, 1.1, true) + okBadge(690, 100, 0.9, 0.6); break;
    case "omzet": inner = blob("var(--c2)") + p({ x: 300, expr: "senang", pose: "hold", hair: "hijab", skin: 1 }) + phone(300, 380, 1.1, "chart") + coins(580, 460, 1.3, 0.3) + sparkle(560, 120, 1, 0.5) + coins(690, 520, 0.8, 0.7); break;
    case "kamera": inner = blob("var(--c3)") + camera(560, 250, 1.5, 0.2) + sliders(560, 430, 1.3, 0.5) + p({ x: 240, expr: "berpikir", pose: "chin", hair: "short", skin: 2 }); break;
    case "cetak": inner = blob("var(--c2)") + printer(580, 400, 1.6) + strip(620, 220, 0.75, 8, 0.3) + p({ x: 260, expr: "senang", pose: "point", hair: "long" }) + sparkle(130, 110, 0.9, 0.6); break;
    case "desain": inner = blob("var(--c1)") + frames(570, 320, 1.5) + p({ x: 250, expr: "berpikir", pose: "point", hair: "curly", skin: 2 }) + sparkle(430, 90, 0.8, 0.6); break;
    case "aman": inner = blob("var(--c2)") + shield(590, 280, 1.8, 0.2) + lock(700, 480, 0.9, 0.5) + p({ x: 250, expr: "lega", pose: "down", hair: "short", skin: 1 }); break;
    case "mulai": inner = blob("var(--c3)") + rocket(600, 270, 1.8) + checklist(120, 440, 1, 0.4) + p({ x: 300, y: 170, expr: "kaget", pose: "up", hair: "bun" }) + sparkle(700, 110, 0.9, 0.5); break;
    case "chat": inner = blob("var(--c2)") + p({ x: 300, expr: "senang", pose: "hold", hair: "long", skin: 1 }) + phone(300, 370, 1.1, "chat") + bubble(560, 150, 1.2, "them", 0.3) + bubble(610, 300, 1.2, "us", 0.7) + bubble(540, 440, 1, "them", 1.1); break;
    case "hasil": inner = blob("var(--c1)") + phone(560, 300, 1.7, "photo") + p({ x: 250, expr: "senang", pose: "point", hair: "hijab", skin: 0 }) + sparkle(150, 100, 0.8, 0.4) + sparkle(720, 90, 0.8, 0.6); break;
  }
  return `<svg class="art" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${inner}</svg>`;
}

export const ART_CSS = `
.art{width:100%;height:100%;display:block;overflow:visible}
.art .a-float{animation:afloat 3.4s ease-in-out infinite;animation-delay:calc(var(--s0,0s) + var(--d,0s))}
@keyframes afloat{50%{transform:translateY(-12px)}}
.art .a-pop{animation:apop .7s cubic-bezier(.3,1.5,.5,1) both;animation-delay:calc(var(--s0,0s) + var(--d,0s) + .25s)}
@keyframes apop{from{opacity:0;transform:scale(.4) translateY(30px)}to{opacity:1;transform:none}}
.art .a-shake{animation:ashake .9s ease-in-out infinite;animation-delay:calc(var(--s0,0s) + var(--d,0s))}
@keyframes ashake{0%,100%{transform:rotate(0)}25%{transform:rotate(-7deg)}75%{transform:rotate(7deg)}}
.art .a-blink{animation:ablink 1.4s steps(2,jump-none) infinite;animation-delay:calc(var(--s0,0s) + var(--d,0s))}
@keyframes ablink{50%{opacity:.25}}
`;
