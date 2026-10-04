import type { ReactNode } from "react";
import { usePositionableContext, PositionableProvider } from "./PositionableContext";
import { useScreenLayoutOverrides } from "./useScreenLayout";
import CustomElementView from "@/components/CustomElementView";
import { isCustomId } from "./types";

// A "custom-" id means the admin added this element from scratch in the
// Screen Builder (an uploaded logo, an extra line of text) — it has no
// corresponding <Positionable> already coded into the page, so nothing would
// ever render it. This draws those directly from the saved overrides instead.
function CustomOverlays({ screenKey }: { screenKey: string }) {
  const overrides = useScreenLayoutOverrides(screenKey);
  const custom = Object.values(overrides).filter((el) => isCustomId(el.id) && !el.hidden);
  if (custom.length === 0) return null;
  return (
    <>
      {custom.map((el) => (
        <div
          key={el.id}
          className="pointer-events-none"
          style={{
            position: "absolute",
            left: `${el.xPct}%`,
            top: `${el.yPct}%`,
            width: `${el.widthPct}%`,
            height: `${el.heightPct}%`,
            zIndex: el.zIndex,
            opacity: el.opacity !== undefined ? el.opacity / 100 : undefined,
            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
          }}
        >
          <CustomElementView el={el} />
        </div>
      ))}
    </>
  );
}

/**
 * Wrap a kiosk screen's content in this once. At runtime it fetches this
 * tenant's saved position overrides and provides them so `Positionable`
 * children apply them, and renders any admin-added custom elements on top.
 * When the same page component is mounted *inside* the WYSIWYG editor
 * (ScreenBuilder.tsx), which already wraps it in its own live-editing
 * PositionableProvider further up the tree (and renders custom elements
 * itself, so they're draggable there), this steps aside instead of
 * shadowing that provider with a second, read-only one — the editor's
 * provider is the one that actually needs to win there, so the exact same
 * page component works correctly in both places.
 */
export function ScreenLayoutBoundary({ screenKey, children }: { screenKey: string; children: ReactNode }) {
  const existing = usePositionableContext();
  const overrides = useScreenLayoutOverrides(screenKey);
  if (existing) return <>{children}</>;
  return (
    <PositionableProvider overrides={overrides}>
      {children}
      <CustomOverlays screenKey={screenKey} />
    </PositionableProvider>
  );
}
