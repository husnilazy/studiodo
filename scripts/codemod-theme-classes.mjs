// One-off codemod used for the website-style redesign: rewrites dark-only Tailwind classes
// (text-white/60, border-white/10, bg-white/5, bg-black/20 …) into theme-aware tokens
// (text-fg/60, border-fg/10, bg-fg/5 …) so the same markup reads correctly in light AND dark mode.
// Safe to re-run: it only touches the classes it knows, and never touches an element that sits on a fixed
// colored surface (accent buttons, photo overlays), where white text must stay white.
//
//   node scripts/codemod-theme-classes.mjs <file...>         (rewrites in place, prints a summary)
import fs from "node:fs";

const COLORS = "red|emerald|green|sky|violet|amber|blue|rose|indigo|orange|pink|purple|fuchsia|teal|cyan|lime|yellow";
const base = (tok) => tok.replace(/^(?:[a-z0-9\[\]_&>*-]+:)*/i, ""); // strip variants (hover:, md:, group-hover:…)
const variants = (tok) => tok.slice(0, tok.length - base(tok).length);

const SOLID_BG = [
  /^bg-accent$/, /^bg-black$/, /^bg-black\/([3-9]\d|100)$/, /^bg-gradient-/, /^bg-foreground$/, /^bg-ink-/,
  new RegExp(`^bg-(${COLORS})-[5-9]00$`), /^bg-\[#/, /^bg-red-500\/[6-9]0$/, /^bg-white$/,
];

function processClassString(str) {
  const parts = str.split(/(\s+)/);
  const tokens = parts.filter((_, i) => i % 2 === 0);
  const bases = tokens.map(base);
  const onSolid = bases.some((b) => SOLID_BG.some((re) => re.test(b)) && b !== "bg-white") ||
    // text-black paired with bg-white is the old "light button": handled below, not a "solid surface" signal
    false;
  const whiteButton = bases.includes("bg-white") && bases.includes("text-black");
  const out = parts.map((part, i) => {
    if (i % 2 === 1) return part;
    const v = variants(part);
    const b = base(part);
    let m;
    if (whiteButton) {
      if (b === "bg-white") return `${v}bg-fg`;
      if (b === "text-black") return `${v}text-canvas`;
    }
    if (onSolid) return part;
    if ((m = b.match(/^text-white\/(.+)$/))) return `${v}text-fg/${m[1]}`;
    if (b === "text-white") return `${v}text-fg`;
    if ((m = b.match(/^(bg|border|divide|ring|placeholder|outline|border-[trbl])-white\/(.+)$/))) return `${v}${m[1]}-fg/${m[2]}`;
    if ((m = b.match(/^bg-black\/(\d+)$/))) {
      const n = Number(m[1]);
      if (n <= 20) return `${v}bg-fg/5`;
      if (n <= 30) return `${v}bg-fg/[0.07]`;
      return part;
    }
    if (b === "border-white") return `${v}border-fg`;
    return part;
  });
  return out.join("");
}

// Minimal TSX scanner: finds string literals (", ', and ` with ${} nesting) outside comments and rewrites class strings.
function transform(src) {
  let out = "";
  let i = 0;
  let changed = 0;
  const n = src.length;
  const rewriteLiteral = (text) => {
    if (!/(^|\s)(?:[a-z0-9\[\]_&>*-]+:)*(?:text|bg|border|divide|ring|placeholder|outline)(?:-[trbl])?-(?:white|black)(?:\/|\s|$)/.test(text)) return text;
    const next = processClassString(text);
    if (next !== text) changed += 1;
    return next;
  };

  const scanTemplate = () => {
    // at src[i] === "`"; returns transformed template text, advances i past closing backtick
    let res = "`";
    i += 1;
    let chunk = "";
    const flush = () => { res += rewriteLiteral(chunk); chunk = ""; };
    while (i < n) {
      const c = src[i];
      if (c === "\\") { chunk += c + (src[i + 1] ?? ""); i += 2; continue; }
      if (c === "`") { flush(); res += "`"; i += 1; return res; }
      if (c === "$" && src[i + 1] === "{") {
        flush();
        res += "${";
        i += 2;
        res += scanCode("}");
        res += "}";
        i += 1; // scanCode stops AT the closing brace; step over it or it gets emitted twice
        continue;
      }
      chunk += c;
      i += 1;
    }
    flush();
    return res;
  };

  const scanCode = (until) => {
    let res = "";
    let depth = 0;
    while (i < n) {
      const c = src[i];
      const d = src[i + 1];
      if (c === "/" && d === "/") { const e = src.indexOf("\n", i); const end = e === -1 ? n : e; res += src.slice(i, end); i = end; continue; }
      if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); const end = e === -1 ? n : e + 2; res += src.slice(i, end); i = end; continue; }
      if (until && c === "{") { depth += 1; res += c; i += 1; continue; }
      if (until && c === "}") { if (depth === 0) return res; depth -= 1; res += c; i += 1; continue; }
      if (c === "`") { res += scanTemplate(); continue; }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n && src[j] !== c && src[j] !== "\n") { if (src[j] === "\\") j += 1; j += 1; }
        if (j < n && src[j] === c) {
          const body = src.slice(i + 1, j);
          res += c + rewriteLiteral(body) + c;
          i = j + 1;
          continue;
        }
      }
      res += c;
      i += 1;
    }
    return res;
  };

  out = scanCode(null);
  return { out, changed };
}

let total = 0;
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, "utf8");
  const { out, changed } = transform(src);
  if (out !== src) fs.writeFileSync(file, out);
  total += changed;
  console.log(String(changed).padStart(4), file);
}
console.log("literals rewritten:", total);
