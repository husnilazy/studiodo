import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import Positionable from "@/components/Positionable";
import CustomElementView from "@/components/CustomElementView";
import { PositionableProvider } from "@/lib/screenBuilder/PositionableContext";
import { isCustomId, type LayoutElement, type RegisteredElement } from "@/lib/screenBuilder/types";
import { seedStage, type PreviewStage } from "@/lib/previewMode";
import Tutorial from "./Tutorial";
import Idle from "./Idle";
import PilihPaket from "./PilihPaket";
import PilihOrientasi from "./PilihOrientasi";
import Pembayaran from "./Pembayaran";
import PilihFrame from "./PilihFrame";
import SesiFoto from "./SesiFoto";
import PreviewFoto from "./PreviewFoto";
import Hasil from "./Hasil";

// The screen builder's canvas. It runs INSIDE the editor's iframe, as the real kiosk app at true screen size (real rem,
// vw/vh, fonts and theme) — so what the admin arranges is pixel-for-pixel what the customer gets. The editor around it
// owns the data; this page just draws the screen in "edit mode" and reports clicks and drags up through postMessage.

export const SCREEN_COMPONENTS: Record<string, ComponentType> = {
  idle: Idle,
  tutorial: Tutorial,
  packages: PilihPaket,
  orientation: PilihOrientasi,
  payment: Pembayaran,
  frame: PilihFrame,
  capture: SesiFoto,
  preview: PreviewFoto,
  result: Hasil,
};

export const BUILDER_MSG = {
  ping: "studiodo-builder-ping",
  ready: "studiodo-builder-ready",
  state: "studiodo-builder-state",
  select: "studiodo-builder-select",
  update: "studiodo-builder-update",
  registered: "studiodo-builder-registered",
  align: "studiodo-builder-align",
  patch: "studiodo-builder-patch",
  key: "studiodo-builder-key",
} as const;

type Patch = Partial<Omit<LayoutElement, "id" | "type">>;

export default function BuilderFrame({ screenKey }: { screenKey: string }) {
  const [overrides, setOverrides] = useState<Record<string, LayoutElement>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean } | null>(null);
  const [seeded, setSeeded] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const registeredRef = useRef<RegisteredElement[]>([]);

  // Sample session (package, photos …) so every screen has something to show, without creating anything real.
  useEffect(() => {
    setSeeded(false);
    const stage = (screenKey === "tutorial" ? "idle" : screenKey) as PreviewStage;
    void seedStage(stage).finally(() => setSeeded(true));
  }, [screenKey]);

  const post = useCallback((message: Record<string, unknown>) => window.parent?.postMessage(message, "*"), []);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    post({ type: BUILDER_MSG.select, id });
  }, [post]);

  // Local first (so dragging follows the finger with no round trip), then tell the editor.
  const update = useCallback((id: string, patch: Patch) => {
    setOverrides((current) => {
      const type = current[id]?.type ?? registeredRef.current.find((item) => item.id === id)?.type ?? "text";
      const base: LayoutElement = current[id] ?? { id, type, xPct: 0, yPct: 0, widthPct: 20, heightPct: 10, zIndex: 0 };
      return { ...current, [id]: { ...base, ...patch } };
    });
    post({ type: BUILDER_MSG.update, id, patch });
  }, [post]);

  const reportRegistered = useCallback((elements: RegisteredElement[]) => {
    registeredRef.current = elements;
    post({ type: BUILDER_MSG.registered, elements });
  }, [post]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; overrides?: Record<string, LayoutElement>; selectedId?: string | null; scale?: number; id?: string; axis?: "x" | "y"; patch?: Patch } | null;
      if (!data?.type) return;
      if (data.type === BUILDER_MSG.ping) {
        post({ type: BUILDER_MSG.ready });
        post({ type: BUILDER_MSG.registered, elements: registeredRef.current });
      } else if (data.type === BUILDER_MSG.state) {
        if (data.overrides) setOverrides(data.overrides);
        if (data.selectedId !== undefined) setSelectedId(data.selectedId);
        if (typeof data.scale === "number") setScale(data.scale);
      } else if (data.type === BUILDER_MSG.patch && data.id && data.patch) {
        // The editor changed a property of a page element nobody has moved yet: record where it really sits first,
        // so applying the change doesn't make it jump to the corner.
        const canvas = canvasRef.current;
        const node = canvas?.querySelector<HTMLElement>(`[data-builder-id="${data.id}"]`);
        let base: Patch = {};
        if (!overridesRef.current[data.id] && canvas && node) {
          const box = canvas.getBoundingClientRect();
          const rect = node.getBoundingClientRect();
          base = { xPct: ((rect.left - box.left) / box.width) * 100, yPct: ((rect.top - box.top) / box.height) * 100, widthPct: (rect.width / box.width) * 100, heightPct: (rect.height / box.height) * 100, zIndex: 0 };
        }
        update(data.id, { ...base, ...data.patch });
      } else if (data.type === BUILDER_MSG.align && data.id && data.axis) {
        // Centre an element on the screen: it is measured here, in the real layout, not guessed from percentages.
        const canvas = canvasRef.current;
        const node = canvas?.querySelector<HTMLElement>(`[data-builder-id="${data.id}"]`);
        if (!canvas || !node) return;
        const box = canvas.getBoundingClientRect();
        const rect = node.getBoundingClientRect();
        if (data.axis === "x") update(data.id, { xPct: Math.round(((100 - (rect.width / box.width) * 100) / 2) * 10) / 10 });
        else update(data.id, { yPct: Math.round(((100 - (rect.height / box.height) * 100) / 2) * 10) / 10 });
      }
    };
    window.addEventListener("message", onMessage);
    post({ type: BUILDER_MSG.ready });
    return () => window.removeEventListener("message", onMessage);
  }, [post, update]);

  // Keyboard shortcuts work whichever side has focus: the frame forwards its keys to the editor.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      post({ type: BUILDER_MSG.key, key: event.key, shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey });
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete", "Backspace"].includes(event.key) || ((event.ctrlKey || event.metaKey) && ["z", "y", "d"].includes(event.key.toLowerCase()))) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [post]);

  const Screen = SCREEN_COMPONENTS[screenKey];
  const custom = Object.values(overrides).filter((el) => isCustomId(el.id));

  if (!Screen) return <div className="flex h-full items-center justify-center text-muted">Layar ini belum bisa didesain.</div>;

  return (
    <div ref={canvasRef} className="builder-canvas relative h-full w-full overflow-hidden" onPointerDown={() => select(null)}>
      <PositionableProvider
        editMode
        overrides={overrides}
        selectedId={selectedId}
        onSelect={select}
        onUpdateOverride={update}
        onRegisteredElementsChange={reportRegistered}
        canvasRef={canvasRef}
        scale={scale}
        onGuides={setGuides}
      >
        {seeded && <Screen />}
        {custom.map((el) => (
          <Positionable key={el.id} id={el.id} type={el.type} label={labelFor(el)}>
            <CustomElementView el={el} />
          </Positionable>
        ))}
      </PositionableProvider>
      {guides?.x && <div className="pointer-events-none absolute inset-y-0 left-1/2 z-[9999] w-px bg-fuchsia-500" />}
      {guides?.y && <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[9999] h-px bg-fuchsia-500" />}
    </div>
  );
}

export function labelFor(el: Pick<LayoutElement, "type">) {
  return el.type === "image" ? "Gambar" : el.type === "video" ? "Video / GIF" : el.type === "marquee" ? "Logo berjalan" : "Teks";
}
