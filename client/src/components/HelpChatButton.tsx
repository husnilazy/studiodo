import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SupportAttachment, type SupportChat } from "@/lib/api";
import ChatBody from "@/components/ChatBody";
import { imagesFrom, shrinkImage } from "@/lib/imageUpload";
import { isChatSoundOn, playChime, setChatSound } from "@/lib/notifySound";

// "Bantuan" button for the tenant dashboard: a chat with the STUDIODO team. Messages land in the Superadmin's Bantuan inbox
// (and alert the owner); replies come back here and in the notification bell. Screenshots can be attached (button, paste or drop),
// a problem can be reported as a documented case, and the WhatsApp of the team is one tap away. A new reply plays a chime and pops up
// above the button until it is read, so an answer is never missed. Polls gently: every 20s closed, 8s open.

const time = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const MAX_FILES = 4;

const CATEGORIES = [
  { id: "bug", label: "Bug aplikasi" },
  { id: "payment", label: "Pembayaran / saldo" },
  { id: "device", label: "Kamera / printer" },
  { id: "billing", label: "Langganan / tagihan" },
  { id: "feature", label: "Saran fitur" },
  { id: "other", label: "Lainnya" },
];
const STATUS_LABEL: Record<string, string> = { new: "Baru", investigating: "Sedang diperiksa", waiting: "Menunggu info", resolved: "Selesai", wontfix: "Tidak dilanjutkan" };
const STATUS_TONE: Record<string, string> = { new: "bg-sky-500/15 text-sky-600", investigating: "bg-amber-500/15 text-amber-600", waiting: "bg-violet-500/15 text-violet-600", resolved: "bg-emerald-500/15 text-emerald-600", wontfix: "bg-fg/10 text-fg/50" };

type Pending = SupportAttachment & { preview: string };
type View = "chat" | "report" | "cases";

async function captureContext(): Promise<Record<string, string>> {
  const appVersion = await window.studiodo?.getVersion?.().catch(() => undefined);
  return {
    ...(appVersion ? { appVersion } : {}),
    page: window.location.hash || window.location.pathname,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language,
  };
}

export default function HelpChatButton() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [chat, setChat] = useState<SupportChat | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Pending[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [popup, setPopup] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(isChatSoundOn);
  const [report, setReport] = useState({ category: "bug", title: "", description: "" });
  const [reportDone, setReportDone] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const prevUnread = useRef<number | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const load = useCallback(async () => {
    try {
      const r = await api.getSupport();
      if (!r) return;
      setChat(r);
      // A reply the tenant has not read yet: chime + popup (also on the very first load, so one that arrived while away is not missed).
      const before = prevUnread.current;
      if (r.unread > 0 && (before === null || r.unread > before) && !openRef.current) {
        const lastAdmin = [...r.messages].reverse().find((m) => m.sender === "admin");
        setPopup(lastAdmin ? (lastAdmin.body || "Gambar dari tim STUDIODO") : "Ada balasan baru dari tim STUDIODO");
        if (before !== null) playChime();
      }
      prevUnread.current = r.unread;
    } catch { /* offline: keep what we have */ }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, open ? 8_000 : 20_000);
    return () => window.clearInterval(id);
  }, [load, open]);

  // Unread count in the browser tab title, so a reply is noticed even from another tab.
  useEffect(() => {
    const unread = chat?.unread ?? 0;
    const base = document.title.replace(/^\(\d+\)\s+/, "");
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
    return () => { document.title = base; };
  }, [chat?.unread]);

  useEffect(() => {
    if (open) setPopup(null);
    if (open && view === "chat" && chat && chat.unread > 0) { void api.readSupport().then(() => { prevUnread.current = 0; setChat((c) => (c ? { ...c, unread: 0 } : c)); }).catch(() => undefined); }
    if (open && view === "chat") endRef.current?.scrollIntoView({ block: "end" });
  }, [open, view, chat]);

  const addFiles = async (picked: File[]) => {
    if (picked.length === 0) return;
    setError("");
    const room = MAX_FILES - files.length;
    if (room <= 0) return setError(`Maksimal ${MAX_FILES} gambar per pesan.`);
    setUploading(true);
    try {
      for (const original of picked.slice(0, room)) {
        const small = await shrinkImage(original);
        const stored = await api.uploadSupportImage(small);
        if (stored) setFiles((prev) => [...prev, { ...stored, preview: stored.url }]);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal mengunggah gambar"); } finally { setUploading(false); }
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && files.length === 0) || busy || uploading) return;
    setBusy(true); setError("");
    try {
      const r = await api.sendSupport(body, files.map(({ url, name }) => ({ url, name })));
      if (r) { setChat(r); setText(""); setFiles([]); prevUnread.current = r.unread; }
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal mengirim"); } finally { setBusy(false); }
  };

  const submitReport = async () => {
    if (busy || uploading) return;
    if (report.title.trim().length < 3) return setError("Isi judul laporan (minimal 3 karakter).");
    if (!report.description.trim()) return setError("Jelaskan masalahnya.");
    setBusy(true); setError("");
    try {
      const r = await api.createSupportCase({ ...report, title: report.title.trim(), description: report.description.trim(), attachments: files.map(({ url, name }) => ({ url, name })), context: await captureContext() });
      if (r) { setChat(r.chat); setReportDone(r.caseNo); setReport({ category: "bug", title: "", description: "" }); setFiles([]); prevUnread.current = r.chat.unread; }
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal mengirim laporan"); } finally { setBusy(false); }
  };

  const toggleSound = () => { const next = !soundOn; setChatSound(next); setSoundOn(next); if (next) playChime(); };
  const switchView = (next: View) => { setView(next); setError(""); setReportDone(null); };

  const unread = chat?.unread ?? 0;
  const waHref = chat?.whatsapp ? `https://wa.me/${chat.whatsapp}?text=${encodeURIComponent("Halo tim STUDIODO, saya butuh bantuan.")}` : null;
  const attachmentBar = (
    <>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-2">
          {files.map((f) => (
            <div key={f.url} className="relative">
              <img src={f.preview} alt={f.name} className="h-14 w-14 rounded-lg object-cover" />
              <button type="button" aria-label="Hapus gambar" onClick={() => setFiles((prev) => prev.filter((x) => x.url !== f.url))} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-fg text-[10px] text-canvas">✕</button>
            </div>
          ))}
        </div>
      )}
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    </>
  );

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div
          className="flex h-[min(560px,75vh)] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl border border-fg/10 bg-surface shadow-2xl"
          role="dialog" aria-label="Bantuan"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void addFiles(imagesFrom(e.dataTransfer)); }}
        >
          <div className="border-b border-fg/10 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-base font-semibold">Bantuan STUDIODO</p>
                <p className="text-xs text-fg/50">Tulis kendala Anda, tim kami membalas di sini.</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={toggleSound} aria-label={soundOn ? "Matikan bunyi notifikasi" : "Nyalakan bunyi notifikasi"} title={soundOn ? "Bunyi notifikasi: nyala" : "Bunyi notifikasi: mati"} className="rounded-full border border-fg/15 px-2.5 py-1 text-xs">{soundOn ? "🔔" : "🔕"}</button>
                <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-fg/15 px-2.5 py-1 text-xs" aria-label="Tutup bantuan">✕</button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <button type="button" onClick={() => switchView("chat")} className={`rounded-full px-3 py-1 ${view === "chat" ? "bg-fg text-canvas" : "border border-fg/15 text-fg/60"}`}>Chat</button>
              <button type="button" onClick={() => switchView("report")} className={`rounded-full px-3 py-1 ${view === "report" ? "bg-fg text-canvas" : "border border-fg/15 text-fg/60"}`}>Laporkan masalah</button>
              <button type="button" onClick={() => switchView("cases")} className={`rounded-full px-3 py-1 ${view === "cases" ? "bg-fg text-canvas" : "border border-fg/15 text-fg/60"}`}>Laporan saya{chat?.cases?.length ? ` (${chat.cases.length})` : ""}</button>
              {waHref && <a href={waHref} target="_blank" rel="noopener noreferrer" className="ml-auto rounded-full bg-emerald-600 px-3 py-1 text-white">WhatsApp</a>}
            </div>
          </div>

          {view === "chat" && (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {chat?.messages.length === 0 && <p className="rounded-xl bg-fg/[0.05] px-3 py-3 text-sm text-fg/60">Halo! Ada yang bisa kami bantu? Ceritakan masalahnya (misalnya kamera, printer, pembayaran, atau langganan). Anda bisa melampirkan screenshot.</p>}
                {chat?.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender === "tenant" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.sender === "tenant" ? "bg-accent text-white" : "bg-fg/[0.07]"}`}>
                      <ChatBody text={m.body} attachments={m.attachments} />
                      <p className={`mt-1 text-[10px] ${m.sender === "tenant" ? "text-white/70" : "text-fg/40"}`}>{m.sender === "admin" ? "Tim STUDIODO · " : ""}{time(m.createdAt)}</p>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              {error && <p className="px-4 pb-1 text-xs text-red-500">{error}</p>}
              {attachmentBar}
              <div className="flex items-end gap-2 border-t border-fg/10 p-3">
                <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading || files.length >= MAX_FILES} aria-label="Lampirkan gambar" title="Lampirkan gambar (atau tempel / seret ke sini)" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-fg/15 text-lg disabled:opacity-40">{uploading ? "…" : "📎"}</button>
                <textarea
                  rows={2} value={text} maxLength={2000}
                  onChange={(e) => setText(e.target.value)}
                  onPaste={(e) => { const pics = imagesFrom(e.clipboardData); if (pics.length) { e.preventDefault(); void addFiles(pics); } }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder="Tulis pesan atau tempel link / screenshot…"
                  className="min-h-[44px] flex-1 resize-none rounded-xl border border-fg/15 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <button type="button" disabled={(!text.trim() && files.length === 0) || busy || uploading} onClick={() => void send()} className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-40">{busy ? "…" : "Kirim"}</button>
              </div>
            </>
          )}

          {view === "report" && (
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {reportDone !== null ? (
                <div className="rounded-xl bg-emerald-500/10 p-4 text-sm">
                  <p className="font-semibold text-emerald-600">Laporan #{reportDone} terkirim</p>
                  <p className="mt-1 text-fg/65">Tim STUDIODO sudah menerimanya dan akan membalas di chat. Status laporan bisa dilihat di tab "Laporan saya".</p>
                  <button type="button" onClick={() => switchView("chat")} className="mt-3 rounded-lg bg-fg px-3 py-1.5 text-xs font-semibold text-canvas">Kembali ke chat</button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-fg/55">Laporan dicatat lengkap (versi aplikasi dan halaman yang sedang dibuka ikut tercatat otomatis) supaya masalahnya bisa dilacak sampai selesai.</p>
                  <label className="block text-xs font-semibold text-fg/60">Jenis masalah
                    <select value={report.category} onChange={(e) => setReport({ ...report, category: e.target.value })} className="mt-1 w-full rounded-xl border border-fg/15 bg-canvas px-3 py-2 text-sm font-normal text-fg outline-none focus:border-accent">
                      {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-fg/60">Judul singkat
                    <input value={report.title} maxLength={120} onChange={(e) => setReport({ ...report, title: e.target.value })} placeholder="Contoh: QRIS tidak muncul di kiosk" className="mt-1 w-full rounded-xl border border-fg/15 bg-canvas px-3 py-2 text-sm font-normal text-fg outline-none focus:border-accent" />
                  </label>
                  <label className="block text-xs font-semibold text-fg/60">Ceritakan apa yang terjadi
                    <textarea rows={4} value={report.description} maxLength={2000} onChange={(e) => setReport({ ...report, description: e.target.value })} onPaste={(e) => { const pics = imagesFrom(e.clipboardData); if (pics.length) { e.preventDefault(); void addFiles(pics); } }} placeholder="Langkah yang dilakukan, hasil yang muncul, dan hasil yang diharapkan." className="mt-1 w-full resize-none rounded-xl border border-fg/15 bg-canvas px-3 py-2 text-sm font-normal text-fg outline-none focus:border-accent" />
                  </label>
                  {attachmentBar}
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading || files.length >= MAX_FILES} className="rounded-xl border border-fg/15 px-3 py-2 text-xs font-semibold disabled:opacity-40">{uploading ? "Mengunggah…" : "📎 Lampirkan screenshot"}</button>
                    <button type="button" disabled={busy || uploading} onClick={() => void submitReport()} className="ml-auto rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Mengirim…" : "Kirim laporan"}</button>
                  </div>
                  {error && <p className="text-xs text-red-500">{error}</p>}
                </>
              )}
            </div>
          )}

          {view === "cases" && (
            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {(chat?.cases ?? []).length === 0 && <p className="rounded-xl bg-fg/[0.05] px-3 py-3 text-sm text-fg/60">Belum ada laporan. Gunakan "Laporkan masalah" untuk mencatat bug atau kendala.</p>}
              {(chat?.cases ?? []).map((c) => (
                <div key={c.id} className="rounded-xl border border-fg/10 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">#{c.caseNo}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[c.status] ?? ""}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
                    <span className="ml-auto text-[10px] text-fg/40">{time(c.updatedAt)}</span>
                  </div>
                  <p className="mt-1 truncate">{c.title}</p>
                  <p className="text-[11px] text-fg/45">{CATEGORIES.find((x) => x.id === c.category)?.label ?? c.category}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!open && popup && (
        <div role="alert" className="flex w-[min(320px,calc(100vw-2.5rem))] items-start gap-3 rounded-2xl border border-accent/40 bg-surface p-3 shadow-2xl">
          <button type="button" onClick={() => { setOpen(true); setView("chat"); }} className="flex-1 text-left">
            <p className="text-xs font-semibold text-accent">Balasan baru dari tim STUDIODO</p>
            <p className="mt-0.5 line-clamp-2 text-sm">{popup}</p>
          </button>
          <button type="button" aria-label="Tutup pemberitahuan" onClick={() => setPopup(null)} className="rounded-full border border-fg/15 px-2 py-0.5 text-xs">✕</button>
        </div>
      )}

      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Bantuan" className="relative flex h-14 items-center gap-2 rounded-full bg-fg px-5 text-sm font-semibold text-canvas shadow-xl transition hover:scale-[1.03]">
        <span aria-hidden>💬</span> Bantuan
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-[22px] animate-pulse rounded-full bg-red-500 px-1.5 text-center text-xs font-bold leading-[22px] text-white ring-2 ring-surface">{unread > 9 ? "9+" : unread}</span>}
      </button>
    </div>
  );
}
