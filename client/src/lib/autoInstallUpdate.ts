import { useEffect, useState } from "react";

// A downloaded update only takes effect after a restart, and a kiosk is never closed by hand. So once an update has been
// downloaded, the kiosk restarts itself — but only when it is safe: sitting on the start screen, no session in progress,
// and nobody has touched it for a while. Skipped when the admin switched auto-update off for this kiosk.
// Just before the restart a countdown notice is shown (any touch cancels it and postpones the restart), so the app never
// closes by surprise.

const POLL_MS = 30_000;
const QUIET_MS = 90_000;
const COUNTDOWN_S = 15;

export interface UpdateCountdown { seconds: number; version: string | null }

export function useAutoInstallUpdate(): { countdown: UpdateCountdown | null } {
  const [countdown, setCountdown] = useState<UpdateCountdown | null>(null);

  useEffect(() => {
    const studiodo = window.studiodo;
    if (!studiodo?.getUpdaterStatus || !studiodo.installUpdateNow) return;
    let lastTouch = Date.now();
    let cancelled = false;
    let counting = false;
    const touch = () => {
      lastTouch = Date.now();
      if (counting) cancelled = true;
    };
    window.addEventListener("pointerdown", touch, true);
    window.addEventListener("keydown", touch, true);

    let installing = false;
    const timer = window.setInterval(async () => {
      if (installing || counting) return;
      // Only the start screen. Every other route (sessions, payment, admin…) means someone is using it.
      const route = window.location.hash.replace(/^#/, "");
      if (route !== "/" && route !== "") return;
      if (Date.now() - lastTouch < QUIET_MS) return;
      try {
        const status = await studiodo.getUpdaterStatus();
        if (status.state !== "downloaded" || status.autoUpdateEnabled === false) return;
        counting = true;
        cancelled = false;
        for (let left = COUNTDOWN_S; left > 0; left--) {
          setCountdown({ seconds: left, version: status.version });
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          if (cancelled) break;
        }
        counting = false;
        setCountdown(null);
        if (cancelled) return;
        installing = true;
        await studiodo.installUpdateNow();
      } catch {
        installing = false;
        counting = false;
        setCountdown(null);
      }
    }, POLL_MS);

    return () => {
      window.clearInterval(timer);
      cancelled = true;
      window.removeEventListener("pointerdown", touch, true);
      window.removeEventListener("keydown", touch, true);
    };
  }, []);

  return { countdown };
}
