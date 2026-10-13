import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AdminNotification } from "@/lib/api";
import { Icon } from "@/components/kiosk/Icons";

// Bell for the in-app tenant admin: the same notifications the web dashboard shows (messages from STUDIODO, licence
// warnings, booth alerts). Polls once a minute while the window is visible. Links to web pages open in the browser.

const TONE: Record<string, string> = {
  info: "bg-indigo-500/15 text-indigo-600",
  success: "bg-emerald-500/15 text-emerald-600",
  warning: "bg-amber-500/15 text-amber-600",
  critical: "bg-red-500/15 text-red-600",
};
const ICON: Record<string, string> = { platform: "bell", customer_message: "mail", billing: "card", booth: "monitor", system: "info" };

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} hari lalu` : new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

/** Portal links are relative to the website; this app only knows the API host, so build an absolute web link when possible. */
function openLink(url: string) {
  const target = url.startsWith("/") ? `https://www.studiodo.id${url}` : url;
  window.open(target, "_blank", "noopener");
}

export default function AdminNotificationBell() {
  const [items, setItems] = useState<AdminNotification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.getNotifications(20);
      if (r) { setItems(r.items); setUnread(r.unread); }
    } catch { /* an older API without notifications: the bell just stays empty */ }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const markRead = (body: { ids: string[] } | { all: true }) => {
    setItems((cur) => {
      const ids = "all" in body ? null : new Set(body.ids);
      const next = (cur ?? []).map((n) => (ids === null || ids.has(n.id) ? { ...n, read: true } : n));
      setUnread(next.filter((n) => !n.read).length);
      return next;
    });
    void api.markNotificationsRead(body).catch(() => undefined);
  };

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi"} aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-fg/10 bg-surface text-fg/70 shadow-sm transition hover:border-accent/50 hover:text-fg">
        <Icon name="bell" className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-[19px] rounded-full bg-red-500 px-1 text-center text-[10.5px] font-bold leading-[19px] text-white ring-2 ring-[var(--kiosk-background)]">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-fg/10 bg-surface shadow-2xl">
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h2 className="font-display text-base font-semibold">Notifikasi</h2>
            {unread > 0 && <button type="button" onClick={() => markRead({ all: true })} className="text-xs font-semibold text-accent hover:underline">Tandai semua dibaca</button>}
          </div>
          <div className="max-h-[min(420px,60vh)] overflow-y-auto px-2 pb-3">
            {!items ? <p className="px-4 py-8 text-center text-sm text-fg/45">Memuat…</p>
              : items.length === 0 ? <p className="px-4 py-8 text-center text-sm text-fg/45">Belum ada notifikasi.</p>
              : items.map((n) => (
                <button key={n.id} type="button" onClick={() => { if (!n.read) markRead({ ids: [n.id] }); if (n.linkUrl) openLink(n.linkUrl); }}
                  className={`flex w-full gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-fg/[0.06] ${n.read ? "" : "bg-accent/[0.07]"}`}>
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONE[n.severity] ?? TONE.info}`}><Icon name={ICON[n.kind] ?? "bell"} className="h-[17px] w-[17px]" /></span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm leading-snug ${n.read ? "font-medium" : "font-semibold"}`}>{n.title}</span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-fg/55">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-fg/40">{ago(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="belum dibaca" />}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
