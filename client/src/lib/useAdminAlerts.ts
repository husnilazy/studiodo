import { useCallback, useEffect, useRef, useState } from "react";
import { superadminApi, type AlertSummary } from "@/lib/superadminApi";

// Polls the alert summary for the Superadmin dashboard (menu badges) and pops a desktop notification for every NEW alert.
// Inside the Superadmin Electron app the notification goes through its preload bridge (window.studiodoSuperadmin); in a plain
// browser it uses the Web Notification API once the user allowed it.

declare global {
  interface Window { studiodoSuperadmin?: { notify?: (title: string, body: string) => void; setBadge?: (count: number) => void } }
}

export function desktopNotify(title: string, body: string) {
  try {
    if (window.studiodoSuperadmin?.notify) window.studiodoSuperadmin.notify(title, body);
    else if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(title, { body });
  } catch { /* notifications are best effort */ }
}

export function useAdminAlerts(enabled: boolean, intervalMs = 30_000) {
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const seenAt = useRef<number>(Date.now());

  const refresh = useCallback(async () => {
    try {
      const sum = await superadminApi.getAlertSummary();
      if (!sum) return;
      setSummary(sum);
      window.studiodoSuperadmin?.setBadge?.(sum.unread);
      if (sum.unread > 0) {
        const list = await superadminApi.getAlerts({ unread: true, limit: 5 });
        const fresh = (list?.items ?? []).filter((a) => new Date(a.createdAt).getTime() > seenAt.current).reverse();
        for (const a of fresh) desktopNotify(a.title, a.body ?? "");
        if (fresh.length) seenAt.current = Math.max(...fresh.map((a) => new Date(a.createdAt).getTime()));
      }
    } catch { /* offline or logged out: the next tick retries */ }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    seenAt.current = Date.now();
    void refresh();
    const id = window.setInterval(() => { if (document.visibilityState === "visible" || window.studiodoSuperadmin) void refresh(); }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, refresh]);

  return { summary, refresh };
}
