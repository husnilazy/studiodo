import { useEffect } from "react";

// A downloaded update only takes effect after a restart, and a kiosk is never closed by hand. So once an update has been
// downloaded, the kiosk restarts itself — but only when it is safe: sitting on the start screen, no session in progress,
// and nobody has touched it for a while. Skipped when the admin switched auto-update off for this kiosk.

const POLL_MS = 30_000;
const QUIET_MS = 90_000;

export function useAutoInstallUpdate() {
  useEffect(() => {
    const studiodo = window.studiodo;
    if (!studiodo?.getUpdaterStatus || !studiodo.installUpdateNow) return;
    let lastTouch = Date.now();
    const touch = () => { lastTouch = Date.now(); };
    window.addEventListener("pointerdown", touch, true);
    window.addEventListener("keydown", touch, true);

    let installing = false;
    const timer = window.setInterval(async () => {
      if (installing) return;
      // Only the start screen. Every other route (sessions, payment, admin…) means someone is using it.
      const route = window.location.hash.replace(/^#/, "");
      if (route !== "/" && route !== "") return;
      if (Date.now() - lastTouch < QUIET_MS) return;
      try {
        const status = await studiodo.getUpdaterStatus();
        if (status.state !== "downloaded" || status.autoUpdateEnabled === false) return;
        installing = true;
        await studiodo.installUpdateNow();
      } catch {
        installing = false;
      }
    }, POLL_MS);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", touch, true);
      window.removeEventListener("keydown", touch, true);
    };
  }, []);
}
