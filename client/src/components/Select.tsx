import { Children, Fragment, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Drop-in replacement for the browser <select> in the admin screens: same props the call sites already use
// (value, onChange(e) with e.target.value, className, disabled, <option> children), but the list is a rounded, animated popup that
// follows the dashboard theme instead of the operating system's white list. Keyboard: arrows, Home/End, Enter/Space, Esc, type-ahead.

interface Opt { value: string; label: string; disabled: boolean }

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function collect(children: ReactNode, out: Opt[] = []): Opt[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>;
    if (el.type === "option") {
      const label = textOf(el.props.children);
      out.push({ value: el.props.value !== undefined ? String(el.props.value) : label, label, disabled: Boolean(el.props.disabled) });
    } else if (el.type === Fragment || el.type === "optgroup") collect(el.props.children, out);
  });
  return out;
}

interface Props {
  value: string | number | null | undefined;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  title?: string;
  "aria-label"?: string;
}

const MAX_H = 288; // px; the list scrolls beyond this

export default function Select({ value, onChange, children, className = "", disabled, id, title, "aria-label": ariaLabel }: Props) {
  const options = useMemo(() => collect(children), [children]);
  const current = String(value ?? "");
  const selected = options.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < Math.min(MAX_H, 180) && above > below;
    const width = Math.max(r.width, 160);
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8));
    setPos(up ? { left, width, bottom: window.innerHeight - r.top + 6, maxH: Math.min(MAX_H, above) } : { left, width, top: r.bottom + 6, maxH: Math.min(MAX_H, below) });
  }, []);

  const close = useCallback((refocus = true) => { setOpen(false); if (refocus) trigger.current?.focus(); }, []);
  const openList = () => {
    if (disabled) return;
    place();
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    setOpen(true);
  };
  const choose = (opt: Opt) => {
    if (opt.disabled) return;
    close();
    if (opt.value !== current) onChange?.({ target: { value: opt.value }, currentTarget: { value: opt.value } } as unknown as ChangeEvent<HTMLSelectElement>);
  };

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!list.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false); };
    const onScroll = (e: Event) => { if (!list.current?.contains(e.target as Node)) setOpen(false); }; // scrolling the page under it: close, never float loose
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onResize); };
  }, [open]);
  useEffect(() => { if (open && active >= 0) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [open, active]);

  const move = (dir: 1 | -1, from = active) => {
    if (!options.length) return;
    let i = from;
    for (let n = 0; n < options.length; n++) { i = (i + dir + options.length) % options.length; if (!options[i].disabled) return setActive(i); }
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Home") { e.preventDefault(); setActive(options.findIndex((o) => !o.disabled)); }
    else if (e.key === "End") { e.preventDefault(); setActive(options.length - 1 - [...options].reverse().findIndex((o) => !o.disabled)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (options[active]) choose(options[active]); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const hit = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  };

  const placeholder = !selected || (selected.value === "" && selected.label !== "");
  return (
    <>
      <button
        ref={trigger} type="button" id={id} title={title} disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(false) : openList())} onKeyDown={onKeyDown}
        className={`sa-select flex items-center justify-between gap-2 text-left transition ${open ? "!border-accent ring-2 ring-accent/25" : ""} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate ${placeholder ? "opacity-55" : ""}`}>{selected?.label || " "}</span>
        <svg viewBox="0 0 20 20" aria-hidden className={`h-4 w-4 shrink-0 opacity-60 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></svg>
      </button>
      {open && pos && createPortal(
        <div
          ref={list} id={listId} role="listbox" aria-label={ariaLabel}
          style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH, zIndex: 1000, transformOrigin: pos.top !== undefined ? "top" : "bottom" }}
          className="sa-select-list overflow-y-auto rounded-2xl border border-fg/10 bg-surface p-1.5 text-sm text-fg shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)]"
        >
          {options.map((o, i) => (
            <div
              key={`${o.value}-${i}`} data-i={i} role="option" aria-selected={o.value === current} aria-disabled={o.disabled}
              onMouseEnter={() => !o.disabled && setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-colors ${o.disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"} ${i === active ? "bg-accent/15" : ""} ${o.value === current ? "font-semibold text-accent" : ""}`}
            >
              <span className="min-w-0 flex-1 whitespace-normal break-words">{o.label || " "}</span>
              {o.value === current && <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>}
            </div>
          ))}
          {options.length === 0 && <div className="px-3 py-2 opacity-55">Tidak ada pilihan</div>}
        </div>,
        document.body,
      )}
    </>
  );
}
