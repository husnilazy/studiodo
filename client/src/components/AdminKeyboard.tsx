import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAdminPrefs } from "@/lib/adminTheme";
import { Icon } from "@/components/kiosk/Icons";

// On-screen keyboard for the admin / crew side, for when nobody brought a physical keyboard to the booth.
//
// It types into whatever field is focused (any <input>/<textarea> on the page, including inputs inside React
// controlled components) by setting the value through the native setter and firing a real `input` event, so React
// state, validation and onChange handlers all behave exactly as if a person typed. The keyboard panel itself never
// takes focus (mousedown/pointerdown are cancelled), so the field keeps its caret while keys are pressed.
//
// It hides again when: "Selesai" is pressed, the user taps outside any field, or a REAL keyboard key is pressed
// (a crew member with a physical keyboard doesn't want a screen keyboard in the way).

type EditableEl = HTMLInputElement | HTMLTextAreaElement;
type Layer = "alpha" | "symbols";
type ShiftState = "off" | "once" | "caps";

const TEXT_INPUT_TYPES = new Set(["", "text", "search", "email", "password", "tel", "url", "number"]);
const NUMERIC_MODES = new Set(["numeric", "decimal", "tel"]);

const ALPHA_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];
const SYMBOL_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["@", "#", "$", "%", "&", "*", "-", "+", "=", "/"],
  ["(", ")", ":", ";", "'", "\"", "!", "?", "_"],
];
const NUMPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "-"],
];

function isEditable(el: EventTarget | null): el is EditableEl {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled && !el.closest("[data-no-vkeyboard]");
  if (el instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(el.type) && !el.readOnly && !el.disabled && !el.closest("[data-no-vkeyboard]");
  }
  return false;
}

function isNumericField(el: EditableEl) {
  return el instanceof HTMLInputElement && (el.type === "number" || NUMERIC_MODES.has(el.inputMode));
}

function setNativeValue(el: EditableEl, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** selectionStart is null for type=number/email — fall back to "caret at the end". */
function readCaret(el: EditableEl): [number, number] {
  try {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start !== null && end !== null) return [start, end];
  } catch {
    // some input types throw instead of returning null
  }
  return [el.value.length, el.value.length];
}

function writeCaret(el: EditableEl, pos: number) {
  try {
    el.setSelectionRange(pos, pos);
  } catch {
    // number/email inputs have no caret API — nothing to restore
  }
}

function fieldLabel(el: EditableEl) {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria;
  if (el.id) {
    const byFor = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (byFor?.textContent) return byFor.textContent.trim();
  }
  const wrapping = el.closest("label");
  if (wrapping?.textContent) return wrapping.textContent.trim().slice(0, 60);
  return el.placeholder || "Isi kolom";
}

export default function AdminKeyboard() {
  const keyboardAuto = useAdminPrefs((state) => state.keyboardAuto);
  const [target, setTarget] = useState<EditableEl | null>(null);
  const [visible, setVisible] = useState(false);
  const [layer, setLayer] = useState<Layer>("alpha");
  const [shift, setShift] = useState<ShiftState>("once");
  const [preview, setPreview] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<EditableEl | null>(null);
  targetRef.current = target;

  const numeric = target ? isNumericField(target) : false;
  const isPassword = target instanceof HTMLInputElement && target.type === "password";

  const hide = useCallback(() => setVisible(false), []);

  // Show on focus, hide on outside tap or physical key.
  useEffect(() => {
    if (!keyboardAuto) {
      setVisible(false);
      return;
    }
    const onFocusIn = (event: FocusEvent) => {
      if (isEditable(event.target)) {
        setTarget(event.target);
        setPreview(event.target.value);
        setShift(event.target.value.length === 0 ? "once" : "off");
        setLayer("alpha");
        setVisible(true);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const el = event.target as Node | null;
      if (panelRef.current?.contains(el)) return;
      if (isEditable(event.target)) return;
      // A tap on a label that wraps/points to a field is about to focus it — don't flicker the keyboard away.
      if (el instanceof Element && el.closest("label")) return;
      setVisible(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.isTrusted || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Shift" || event.key === "CapsLock" || event.key === "Tab") return;
      if (isEditable(document.activeElement)) setVisible(false);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [keyboardAuto]);

  // If the page is already focused on a field when the keyboard gets switched back on, pick it up.
  useEffect(() => {
    if (keyboardAuto && isEditable(document.activeElement)) {
      setTarget(document.activeElement);
      setPreview(document.activeElement.value);
      setVisible(true);
    }
  }, [keyboardAuto]);

  // Reserve room for the panel (so the page can scroll the field above it) and keep the field in view.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.classList.remove("admin-kb-open");
      root.style.removeProperty("--admin-kb-h");
      return;
    }
    const height = panelRef.current?.offsetHeight ?? 280;
    root.style.setProperty("--admin-kb-h", `${height}px`);
    root.classList.add("admin-kb-open");
    const timer = window.setTimeout(() => targetRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
    return () => window.clearTimeout(timer);
  }, [visible, target, numeric]);

  useEffect(() => () => {
    document.documentElement.classList.remove("admin-kb-open");
    document.documentElement.style.removeProperty("--admin-kb-h");
  }, []);

  const afterEdit = (el: EditableEl) => setPreview(el.value);

  const insert = (text: string) => {
    const el = targetRef.current;
    if (!el) return;
    const [start, end] = readCaret(el);
    const maxLength = el.maxLength > 0 ? el.maxLength : Infinity;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    if (next.length > maxLength) return;
    setNativeValue(el, next);
    writeCaret(el, start + text.length);
    afterEdit(el);
    if (shift === "once") setShift("off");
  };

  const backspace = () => {
    const el = targetRef.current;
    if (!el) return;
    const [start, end] = readCaret(el);
    if (start === 0 && end === 0) return;
    const from = start === end ? start - 1 : start;
    setNativeValue(el, el.value.slice(0, from) + el.value.slice(end));
    writeCaret(el, from);
    afterEdit(el);
  };

  const moveCaret = (delta: number) => {
    const el = targetRef.current;
    if (!el) return;
    const [start] = readCaret(el);
    writeCaret(el, Math.max(0, Math.min(el.value.length, start + delta)));
  };

  const enter = () => {
    const el = targetRef.current;
    if (!el) return;
    if (el instanceof HTMLTextAreaElement) {
      insert("\n");
      return;
    }
    // Same as a real Enter: let the field's own onKeyDown handler run first, then submit its form if nothing took it.
    const keydown = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true });
    el.dispatchEvent(keydown);
    el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    if (!keydown.defaultPrevented) el.form?.requestSubmit();
    setVisible(false);
  };

  const done = () => {
    targetRef.current?.blur();
    setVisible(false);
  };

  if (!keyboardAuto || !visible || !target) return null;

  const letter = (key: string) => (shift !== "off" ? key.toUpperCase() : key);
  const rows = numeric ? NUMPAD_ROWS : layer === "alpha" ? ALPHA_ROWS : SYMBOL_ROWS;
  const keyClass = "flex h-12 min-w-0 flex-1 items-center justify-center rounded-xl border border-fg/10 bg-fg/[0.05] text-base font-semibold transition active:scale-95 active:bg-accent active:text-white hover:bg-fg/10 sm:h-14 sm:text-lg";
  const utilClass = "flex h-12 items-center justify-center rounded-xl border border-fg/10 bg-fg/[0.08] px-3 text-sm font-semibold transition active:scale-95 hover:bg-fg/15 sm:h-14 sm:text-base";

  return (
    <div
      ref={panelRef}
      // The panel must never steal focus from the field being typed into.
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      className="fixed inset-x-0 bottom-0 z-[90] border-t border-fg/10 bg-surface/95 px-3 pb-3 pt-2 shadow-[0_-16px_50px_rgba(10,13,24,0.18)] backdrop-blur-xl"
      role="group"
      aria-label="Keyboard layar"
    >
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-2 flex items-center gap-3">
          <div className="min-w-0 flex-1 rounded-xl border border-fg/10 bg-fg/[0.04] px-3 py-1.5">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-fg/45">{fieldLabel(target)}</p>
            <p className="truncate text-base font-semibold">{isPassword ? "•".repeat(preview.length) : preview || <span className="font-normal text-fg/30">Ketik di sini…</span>}</p>
          </div>
          <button type="button" onClick={done} className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white">
            <Icon name="check" className="h-4 w-4" /> Selesai
          </button>
        </div>

        <div className="space-y-1.5">
          {rows.map((row, rowIndex) => (
            <div
              key={`${numeric ? "n" : layer}-${rowIndex}`}
              className={`mx-auto flex justify-center gap-1.5 ${numeric ? "w-full max-w-sm" : !numeric && layer === "alpha" && rowIndex === 1 ? "w-[92%]" : !numeric && layer === "alpha" && rowIndex === 2 ? "w-[78%]" : "w-full"}`}
            >
              {row.map((key) => (
                <button key={key} type="button" onClick={() => insert(layer === "alpha" && !numeric ? letter(key) : key)} className={keyClass}>
                  {layer === "alpha" && !numeric ? letter(key) : key}
                </button>
              ))}
              {rowIndex === rows.length - 1 && (
                <button type="button" onClick={backspace} className={`${utilClass} w-16 shrink-0`} aria-label="Hapus"><Icon name="backspace" className="h-5 w-5" /></button>
              )}
            </div>
          ))}
        </div>

        {!numeric && (
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => setShift((current) => (current === "off" ? "once" : current === "once" ? "caps" : "off"))}
              className={`${utilClass} w-20 ${shift !== "off" ? "!bg-accent !text-white" : ""}`}
              aria-pressed={shift !== "off"}
            >
              {shift === "caps" ? "ABC" : "Shift"}
            </button>
            <button type="button" onClick={() => setLayer((current) => (current === "alpha" ? "symbols" : "alpha"))} className={`${utilClass} w-20`}>{layer === "alpha" ? "123 #+" : "ABC"}</button>
            <button type="button" onClick={() => moveCaret(-1)} className={`${utilClass} w-12`} aria-label="Geser kiri"><Icon name="arrow-left" className="h-5 w-5" /></button>
            <button type="button" onClick={() => insert(" ")} className={`${utilClass} min-w-0 flex-1`}>Spasi</button>
            <button type="button" onClick={() => moveCaret(1)} className={`${utilClass} w-12`} aria-label="Geser kanan"><Icon name="arrow-right" className="h-5 w-5" /></button>
            <button type="button" onClick={() => insert(".")} className={`${utilClass} w-12`}>.</button>
            <button type="button" onClick={() => insert("@")} className={`${utilClass} w-12`}>@</button>
            <button type="button" onClick={enter} className={`${utilClass} w-20`}>{target instanceof HTMLTextAreaElement ? "Baris" : "Enter"}</button>
          </div>
        )}
        {numeric && (
          <div className="mx-auto mt-1.5 flex w-full max-w-sm gap-1.5">
            <button type="button" onClick={enter} className={`${utilClass} flex-1`}>Enter</button>
          </div>
        )}
      </div>
    </div>
  );
}
