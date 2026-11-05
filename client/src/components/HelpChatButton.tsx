import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SupportChat } from "@/lib/api";

// "Bantuan" button for the tenant dashboard: a chat with the STUDIODO team. Messages land in the Superadmin's Bantuan inbox
// (and alert the owner); replies come back here and in the notification bell. Polls gently: every 45s closed, 10s open.

const time = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function HelpChatButton() {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<SupportChat | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { const r = await api.getSupport(); if (r) setChat(r); } catch { /* offline: keep what we have */ }
  }, []);
  useEffect(() => {
    void load();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, open ? 10_000 : 45_000);
    return () => window.clearInterval(id);
  }, [load, open]);
  useEffect(() => {
    if (open && chat && chat.unread > 0) { void api.readSupport().then(() => setChat((c) => (c ? { ...c, unread: 0 } : c))).catch(() => undefined); }
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [open, chat]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError("");
    try { const r = await api.sendSupport(body); if (r) { setChat(r); setText(""); } } catch (err) { setError(err instanceof Error ? err.message : "Gagal mengirim"); } finally { setBusy(false); }
  };
  const unread = chat?.unread ?? 0;

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[min(520px,70vh)] w-[min(360px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl border border-fg/10 bg-surface shadow-2xl" role="dialog" aria-label="Bantuan">
          <div className="flex items-center justify-between border-b border-fg/10 px-4 py-3">
            <div>
              <p className="font-display text-base font-semibold">Bantuan STUDIODO</p>
              <p className="text-xs text-fg/50">Tulis kendala Anda, tim kami membalas di sini.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-fg/15 px-2.5 py-1 text-xs" aria-label="Tutup bantuan">✕</button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {chat?.messages.length === 0 && <p className="rounded-xl bg-fg/[0.05] px-3 py-3 text-sm text-fg/60">Halo! Ada yang bisa kami bantu? Ceritakan masalahnya (misalnya kamera, printer, pembayaran, atau langganan).</p>}
            {chat?.messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === "tenant" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.sender === "tenant" ? "bg-accent text-white" : "bg-fg/[0.07]"}`}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${m.sender === "tenant" ? "text-white/70" : "text-fg/40"}`}>{m.sender === "admin" ? "Tim STUDIODO · " : ""}{time(m.createdAt)}</p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          {error && <p className="px-4 pb-1 text-xs text-red-500">{error}</p>}
          <div className="flex items-end gap-2 border-t border-fg/10 p-3">
            <textarea rows={2} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Tulis pesan…" className="min-h-[44px] flex-1 resize-none rounded-xl border border-fg/15 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent" />
            <button type="button" disabled={!text.trim() || busy} onClick={() => void send()} className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-40">{busy ? "…" : "Kirim"}</button>
          </div>
        </div>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Bantuan" className="relative flex h-14 items-center gap-2 rounded-full bg-fg px-5 text-sm font-semibold text-canvas shadow-xl transition hover:scale-[1.03]">
        <span aria-hidden>💬</span> Bantuan
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-[22px] rounded-full bg-red-500 px-1.5 text-center text-xs font-bold leading-[22px] text-white ring-2 ring-surface">{unread > 9 ? "9+" : unread}</span>}
      </button>
    </div>
  );
}
