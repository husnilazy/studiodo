import { useEffect } from "react";
import { IS_KIOSK_PREVIEW } from "./previewMode";

// Crew entry to the admin from the customer kiosk, so nobody has to remember Ctrl+Shift+A (or carry a keyboard).
// Five quick taps inside the bottom-left corner open the admin; it is invisible to customers and the admin still
// asks for the tenant login, so this is a convenience, not a way around authentication.

const CORNER_PX = 96;
const TAP_WINDOW_MS = 3000;
const TAPS_NEEDED = 5;
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
      if (event.clientX > CORNER_PX || event.clientY < window.innerHeight - CORNER_PX) return;
      const now = Date.now();
      taps = [...taps.filter((time) => now - time < TAP_WINDOW_MS), now];
      if (taps.length >= TAPS_NEEDED) {
        taps = [];
        openAdminFromKiosk();
      }
    };
    // Capture phase + passive observation only: the tap still reaches whatever is underneath.
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, []);
}
