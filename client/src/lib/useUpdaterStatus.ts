import { useEffect, useState } from "react";
import type { StudiodoUpdaterStatus } from "@/types/electron";

// Live view of the desktop app's updater. The Electron main process pushes every change (download progress, ready,
// installing); a slow poll is only a safety net. Returns null outside the desktop app (plain browser, preview frame).
export function useUpdaterStatus(): StudiodoUpdaterStatus | null {
  const [status, setStatus] = useState<StudiodoUpdaterStatus | null>(null);

  useEffect(() => {
    const studiodo = window.studiodo;
    if (!studiodo?.getUpdaterStatus) return;
    let alive = true;
    const pull = () => studiodo.getUpdaterStatus().then((s) => { if (alive) setStatus(s); }).catch(() => undefined);
    void pull();
    const unsubscribe = studiodo.onUpdaterStatus?.((s) => { if (alive) setStatus({ ...s }); });
    const timer = window.setInterval(pull, 15_000);
    return () => {
      alive = false;
      unsubscribe?.();
      window.clearInterval(timer);
    };
  }, []);

  return status;
}

export function formatMB(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;
}
