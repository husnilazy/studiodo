import type { CSSProperties } from "react";
import type { LayoutElement } from "@/lib/screenBuilder/types";

/**
 * What a custom element (text / picture / video or GIF / running logo) looks like. Used by the real kiosk and by the
 * screen builder canvas, so what the admin arranges is exactly what the customer sees.
 */
export default function CustomElementView({ el }: { el: LayoutElement }) {
  const radius = el.radius ? `${el.radius}%` : undefined;

  if (el.type === "image") {
    const source = el.src ?? el.content;
    return source ? <img src={source} alt="" draggable={false} className="h-full w-full" style={{ objectFit: el.fit ?? "contain", borderRadius: radius }} /> : null;
  }

  if (el.type === "video") {
    return el.src ? <video src={el.src} autoPlay muted loop playsInline className="h-full w-full" style={{ objectFit: el.fit ?? "cover", borderRadius: radius }} /> : null;
  }

  if (el.type === "marquee") return <Marquee el={el} />;

  const style: CSSProperties = {
    fontSize: el.fontSizeVw ? `${el.fontSizeVw}vw` : undefined,
    color: el.color,
    fontWeight: el.bold ? 700 : undefined,
    textAlign: el.align ?? "center",
    justifyContent: el.align === "left" ? "flex-start" : el.align === "right" ? "flex-end" : "center",
    lineHeight: 1.15,
  };
  return <p className="flex h-full w-full items-center whitespace-pre-wrap break-words" style={style}>{el.content}</p>;
}

/** A strip that scrolls endlessly: the logo and/or words repeat, wrapping around seamlessly. */
function Marquee({ el }: { el: LayoutElement }) {
  const seconds = el.speed ?? 20;
  const unit = (key: string) => (
    <span key={key} className="mx-[2.5vw] inline-flex shrink-0 items-center gap-[1.5vw]" style={{ height: "100%" }}>
      {el.src && <img src={el.src} alt="" draggable={false} className="h-[78%] w-auto object-contain" />}
      {el.content && <span style={{ fontSize: el.fontSizeVw ? `${el.fontSizeVw}vw` : undefined, color: el.color, fontWeight: el.bold ? 700 : 600, whiteSpace: "pre" }}>{el.content}</span>}
    </span>
  );
  // Enough copies in each half that one half is always wider than the strip, even for a tiny logo.
  const half = Array.from({ length: 6 }, (_, i) => unit(`a${i}`));
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: el.radius ? `${el.radius}%` : undefined }}>
      <div className="studiodo-marquee absolute left-0 top-0 flex h-full w-max items-center" style={{ animationDuration: `${seconds}s`, animationDirection: el.reverse ? "reverse" : "normal" }}>
        <div className="flex h-full shrink-0 items-center">{half}</div>
        <div className="flex h-full shrink-0 items-center" aria-hidden>{half.map((_, i) => unit(`b${i}`))}</div>
      </div>
    </div>
  );
}
