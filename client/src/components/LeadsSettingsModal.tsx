import { useEffect, useState } from "react";
import { superadminApi, type LeadSettings } from "@/lib/superadminApi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";
import { copyText, downloadText, errMessage, fieldClass, openHtmlPage } from "@/lib/leadUi";
import Select from "@/components/Select";

const box = "rounded-2xl border border-fg/10 bg-fg/[0.03] p-4";
const heading = "text-xs font-semibold uppercase tracking-[.12em] text-fg/45";

function Shell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`flex max-h-[92vh] w-full flex-col rounded-[1.5rem] bg-canvas shadow-2xl ${wide ? "max-w-4xl" : "max-w-2xl"}`} role="dialog" aria-label={title}>
        <header className="flex items-center justify-between border-b border-fg/10 px-6 py-4">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-full border border-fg/20 px-3 py-1.5 text-xs font-semibold">Tutup ✕</button>
        </header>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export default function LeadsSettingsModal({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<LeadSettings | null>(null);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [issuer, setIssuer] = useState({ name: "", address: "", contact: "" });
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [webhook, setWebhook] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");

  const apply = (next: LeadSettings) => { setS((prev) => ({ ...prev, ...next })); setIssuer(next.issuer); setTemplates(Object.fromEntries(next.templates.map((t) => [t.key, t.text]))); };
  useEffect(() => { superadminApi.getLeadSettings().then((r) => { if (r) apply(r); }).catch((e) => setError(errMessage(e))); }, []);

  const run = async (name: string, fn: () => Promise<void>) => { setBusy(name); try { await fn(); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } finally { setBusy(""); } };
  const saveWa = (patch: { provider?: string; token?: string; clearToken?: boolean }) => run("wa", async () => { const r = await superadminApi.saveLeadSettings({ whatsapp: patch }); if (r) { apply(r); setToken(""); pushToast({ type: "success", title: "Pengaturan WhatsApp disimpan" }); } });

  if (!s) return <Shell title="Pengaturan CRM & WhatsApp" onClose={onClose}>{error ? <p className="text-sm text-red-600">{error}</p> : <div className="flex justify-center py-10"><Spinner size="md" /></div>}</Shell>;
  const wa = s.whatsapp;
  return (
    <Shell title="Pengaturan CRM & WhatsApp" onClose={onClose}>
      <div className="space-y-5">
        <div className={box}>
          <p className={heading}>Gateway WhatsApp</p>
          <p className="mt-2 text-sm text-fg/60">Kirim pesan dari dashboard lewat gateway (Fonnte): nomor WhatsApp STUDIODO dipindai sekali dengan QR di fonnte.com, lalu token perangkat ditempel di sini. Tanpa gateway, tombol <b>Buka WhatsApp</b> tetap bisa dipakai.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-fg/60">Provider
              <Select className={fieldClass} value={wa.provider} onChange={(e) => void saveWa({ provider: e.target.value })}><option value="none">Tidak dipakai (hanya wa.me)</option><option value="fonnte">Fonnte</option></Select>
            </label>
            <label className="text-sm text-fg/60">Token perangkat {wa.hasToken && <span className="text-emerald-700">(tersimpan terenkripsi)</span>}
              <input type="password" autoComplete="off" className={fieldClass} placeholder={wa.hasToken ? "Kosongkan untuk tetap memakai yang ada" : "Tempel token dari Fonnte"} value={token} onChange={(e) => setToken(e.target.value)} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={!token.trim() || busy === "wa"} onClick={() => void saveWa({ provider: "fonnte", token })} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-35">Simpan token</button>
            {wa.hasToken && <button type="button" onClick={() => { if (window.confirm("Hapus token dan matikan gateway?")) void saveWa({ clearToken: true }); }} className="rounded-lg border border-fg/20 px-4 py-2 text-xs font-semibold text-red-600">Hapus token</button>}
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${wa.ready ? "bg-emerald-500/15 text-emerald-700" : "bg-fg/8 text-fg/55"}`}>{wa.ready ? "Siap kirim" : "Belum siap"}</span>
          </div>
          {wa.ready && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input className={`${fieldClass} !w-56`} placeholder="Nomor tes, mis. 0877…" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
              <button type="button" disabled={!testPhone.trim() || busy === "test"} onClick={() => void run("test", async () => { await superadminApi.testLeadWhatsapp(testPhone); pushToast({ type: "success", title: "Pesan tes terkirim" }); })} className="rounded-lg border border-fg/20 px-4 py-2 text-xs font-semibold">{busy === "test" ? "Mengirim…" : "Kirim pesan tes"}</button>
            </div>
          )}
          <div className="mt-4 border-t border-fg/10 pt-3">
            <p className="text-sm font-semibold">Balasan masuk (webhook)</p>
            <p className="mt-1 text-xs text-fg/55">Agar balasan calon tenant muncul di riwayat lead, tempel alamat ini di pengaturan <i>Webhook</i> perangkat Fonnte. Alamat hanya tampil sekali setelah dibuat; membuat ulang mematikan alamat lama.</p>
            <button type="button" disabled={busy === "hook"} onClick={() => void run("hook", async () => { const r = await superadminApi.rotateLeadWebhookKey(); if (r) { setWebhook(r.url); apply({ ...s, whatsapp: { ...wa, hasWebhookKey: true } }); } })} className="mt-2 rounded-lg border border-fg/20 px-4 py-2 text-xs font-semibold">{wa.hasWebhookKey ? "Buat ulang alamat webhook" : "Buat alamat webhook"}</button>
            {webhook && (
              <div className="mt-2 rounded-xl bg-fg/[0.05] p-3 text-xs">
                <code className="block break-all">{webhook}</code>
                <button type="button" onClick={async () => pushToast({ type: (await copyText(webhook)) ? "success" : "error", title: "Alamat webhook disalin" })} className="mt-2 rounded-lg border border-fg/20 px-3 py-1.5 font-semibold">Salin</button>
                {!/^https:\/\//.test(webhook) && <p className="mt-2 text-amber-700">PUBLIC_BASE_URL server belum berupa alamat https publik — pastikan alamat ini bisa dijangkau Fonnte.</p>}
              </div>
            )}
          </div>
        </div>

        <div className={box}>
          <p className={heading}>Data STUDIODO untuk surat kerja sama</p>
          <p className="mt-2 text-sm text-fg/60">Tampil sebagai “Pihak Pertama”. Kontrak tidak bisa dikirim sebelum ketiganya diisi.</p>
          <div className="mt-3 grid gap-3">
            <label className="text-sm text-fg/60">Nama badan usaha / pemilik<input className={fieldClass} value={issuer.name} onChange={(e) => setIssuer({ ...issuer, name: e.target.value })} /></label>
            <label className="text-sm text-fg/60">Alamat<input className={fieldClass} value={issuer.address} onChange={(e) => setIssuer({ ...issuer, address: e.target.value })} /></label>
            <label className="text-sm text-fg/60">Kontak resmi (email / WhatsApp)<input className={fieldClass} value={issuer.contact} onChange={(e) => setIssuer({ ...issuer, contact: e.target.value })} /></label>
          </div>
          <button type="button" disabled={busy === "issuer"} onClick={() => void run("issuer", async () => { const r = await superadminApi.saveLeadSettings({ issuer }); if (r) { apply(r); pushToast({ type: "success", title: "Data STUDIODO disimpan" }); } })} className="mt-3 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white">Simpan</button>
        </div>

        <div className={box}>
          <p className={heading}>Template pesan</p>
          <p className="mt-2 text-xs text-fg/55">Variabel: {s.variables?.map((v) => <code key={v.key} className="mr-1.5 rounded bg-fg/8 px-1.5 py-0.5" title={v.label}>{`{${v.key}}`}</code>)}</p>
          <div className="mt-3 space-y-3">
            {s.templates.map((t) => (
              <label key={t.key} className="block text-sm text-fg/60">{t.label}
                <textarea rows={3} className={fieldClass} value={templates[t.key] ?? ""} onChange={(e) => setTemplates({ ...templates, [t.key]: e.target.value })} />
              </label>
            ))}
          </div>
          <button type="button" disabled={busy === "tpl"} onClick={() => void run("tpl", async () => { const r = await superadminApi.saveLeadSettings({ templates }); if (r) { apply(r); pushToast({ type: "success", title: "Template disimpan" }); } })} className="mt-3 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white">Simpan template</button>
        </div>
      </div>
    </Shell>
  );
}

export function LeadDocsModal({ onClose }: { onClose: () => void }) {
  const [which, setWhich] = useState<"team" | "onboarding">("team");
  const [doc, setDoc] = useState<{ title: string; markdown: string; html: string; page: string; publicUrl: string | null } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { setDoc(null); setError(""); superadminApi.getLeadDoc(which).then((d) => d && setDoc(d)).catch((e) => setError(errMessage(e))); }, [which]);
  return (
    <Shell title="Panduan & dokumen" onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-2">
        {([["team", "Panduan follow-up (tim)"], ["onboarding", "Panduan onboarding (calon tenant)"]] as const).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setWhich(k)} className={`rounded-full px-4 py-1.5 text-xs font-semibold ${which === k ? "bg-fg text-canvas" : "border border-fg/20 text-fg/60"}`}>{t}</button>
        ))}
        {doc && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={() => openHtmlPage(doc.page)} className="rounded-lg border border-fg/20 px-3 py-1.5 text-xs font-semibold">Buka halaman cetak / PDF</button>
            <button type="button" onClick={() => downloadText(`${which === "team" ? "panduan-follow-up-tim" : "panduan-onboarding-studiodo"}.md`, doc.markdown)} className="rounded-lg border border-fg/20 px-3 py-1.5 text-xs font-semibold">Unduh .md</button>
            {doc.publicUrl && <button type="button" onClick={async () => pushToast({ type: (await copyText(doc.publicUrl!)) ? "success" : "error", title: "Tautan panduan disalin" })} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white">Salin tautan untuk calon tenant</button>}
          </div>
        )}
      </div>
      {which === "team" && <p className="mt-3 text-xs text-fg/45">Hanya untuk tim — jangan dibagikan ke calon tenant. Angka (trial, biaya, penarikan, diskon) diambil otomatis dari pengaturan platform.</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {!doc && !error && <div className="flex justify-center py-12"><Spinner size="md" /></div>}
      {doc && <article className="lead-doc mt-4 text-sm leading-relaxed [&_blockquote]:my-3 [&_blockquote]:rounded [&_blockquote]:border-l-4 [&_blockquote]:border-accent [&_blockquote]:bg-accent/5 [&_blockquote]:px-4 [&_blockquote]:py-2 [&_code]:rounded [&_code]:bg-fg/8 [&_code]:px-1 [&_h1]:mb-3 [&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:border-b [&_h2]:border-fg/10 [&_h2]:pb-1 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-fg/15 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-fg/15 [&_th]:bg-fg/[0.05] [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: doc.html }} />}
    </Shell>
  );
}
