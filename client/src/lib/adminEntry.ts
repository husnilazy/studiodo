import { useEffect } from "react";
import { IS_KIOSK_PREVIEW } from "./previewMode";
import { useBoothConfig } from "./boothConfigStore";

/** Fired by the hidden corner taps; OperatorConsole listens, asks for the crew PIN (if set) and opens. */
export const OPERATOR_REQUEST_EVENT = "studiodo-operator-request";

// Crew entry to the admin from the customer kiosk, so nobody has to remember Ctrl+Shift+A (or carry a keyboard).
// Quick taps inside a screen corner (corner and count are set in Admin > Kiosk > Akses operator, default 5 taps at the
// bottom-left) open the operator console after the crew PIN. It is invisible to customers. The console only has device
// tools; its "Buka admin" button still goes through the tenant login, so this is a convenience, not a way around it.

const CORNER_PX = 96;
const TAP_WINDOW_MS = 3000;
const PUBLIC_ROUTES = ["#/admin", "#/superadmin", "#/share"];

export function openAdminFromKiosk() {
  const open = window.studiodo?.openAdmin;
  if (open) {
    // Packaged app: the admin gets its own window (same as Ctrl+Shift+A).
    open().catch(() => {
      window.location.hash = "#/admin";
    });
    return;
  }
  window.location.hash = "#/admin";
}

export function useHiddenAdminEntry() {
  useEffect(() => {
    if (IS_KIOSK_PREVIEW) return;
    let taps: number[] = [];
    const onPointerDown = (event: PointerEvent) => {
      if (PUBLIC_ROUTES.some((route) => window.location.hash.startsWith(route))) return;
      const { operatorEntryCorner: corner = "bl", operatorEntryTaps: needed = 5 } = useBoothConfig.getState().config;
      const left = event.clientX <= CORNER_PX;
      const right = event.clientX >= window.innerWidth - CORNER_PX;
      const top = event.clientY <= CORNER_PX;
      const bottom = event.clientY >= window.innerHeight - CORNER_PX;
      const hit = corner === "bl" ? left && bottom : corner === "br" ? right && bottom : corner === "tl" ? left && top : right && top;
      if (!hit) return;
      const now = Date.now();
      taps = [...taps.filter((time) => now - time < TAP_WINDOW_MS), now];
      if (taps.length >= needed) {
        taps = [];
        window.dispatchEvent(new Event(OPERATOR_REQUEST_EVENT));
      }
    };
    // Capture phase + passive observation only: the tap still reaches whatever is underneath.
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, []);
}
