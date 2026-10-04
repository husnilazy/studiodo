import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode, type RefObject } from "react";
import type { LayoutElement, RegisteredElement } from "./types";

interface PositionableContextValue {
  editMode: boolean;
  overrides: Record<string, LayoutElement>;
  selectedId: string | null;
  select: (id: string | null) => void;
  updateOverride: (id: string, patch: Partial<Omit<LayoutElement, "id" | "type">>) => void;
  register: (el: RegisteredElement) => void;
  unregister: (id: string) => void;
  canvasRef: RefObject<HTMLDivElement> | null;
  /** Current canvas zoom (rendered size ÷ real kiosk resolution). Lets
   * Positionable keep its resize handle a constant, grabbable screen size
   * instead of shrinking along with a zoomed-out canvas. */
  scale: number;
  /** Editor only: alignment guides to draw while an element is dragged (null = hide). */
  setGuides: (guides: { x: boolean; y: boolean } | null) => void;
}

const PositionableContext = createContext<PositionableContextValue | null>(null);

/** Returns null when rendered outside any provider — Positionable treats that as "just pass through". */
export function usePositionableContext() {
  return useContext(PositionableContext);
}

interface ProviderProps {
  children: ReactNode;
  /** false (default) = runtime kiosk rendering: only `overrides` matters, selection/registration are no-ops. */
  editMode?: boolean;
  overrides: Record<string, LayoutElement>;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onUpdateOverride?: (id: string, patch: Partial<Omit<LayoutElement, "id" | "type">>) => void;
  onRegisteredElementsChange?: (elements: RegisteredElement[]) => void;
  canvasRef?: RefObject<HTMLDivElement>;
  scale?: number;
  onGuides?: (guides: { x: boolean; y: boolean } | null) => void;
}

export function PositionableProvider({
  children,
  editMode = false,
  overrides,
  selectedId = null,
  onSelect,
  onUpdateOverride,
  onRegisteredElementsChange,
  canvasRef,
  scale = 1,
  onGuides,
}: ProviderProps) {
  // Registration is driven by whatever Positionable components actually mount —
  // this is what keeps the editor's Layers panel truthful to the real page
  // instead of a separately-maintained list that can drift out of sync.
  const registeredRef = useRef<Map<string, RegisteredElement>>(new Map());

  const notifyRegistered = useCallback(() => {
    onRegisteredElementsChange?.(Array.from(registeredRef.current.values()));
  }, [onRegisteredElementsChange]);

  const register = useCallback((el: RegisteredElement) => {
    registeredRef.current.set(el.id, el);
    notifyRegistered();
  }, [notifyRegistered]);

  const unregister = useCallback((id: string) => {
    registeredRef.current.delete(id);
    notifyRegistered();
  }, [notifyRegistered]);

  const value = useMemo<PositionableContextValue>(() => ({
    editMode,
    overrides,
    selectedId,
    select: onSelect ?? (() => undefined),
    updateOverride: onUpdateOverride ?? (() => undefined),
    register,
    unregister,
    canvasRef: canvasRef ?? null,
    scale,
    setGuides: onGuides ?? (() => undefined),
  }), [editMode, overrides, selectedId, onSelect, onUpdateOverride, register, unregister, canvasRef, scale, onGuides]);

  return <PositionableContext.Provider value={value}>{children}</PositionableContext.Provider>;
}
