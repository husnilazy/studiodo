import { useCallback, useEffect, useState } from "react";
import { LEAD_SOURCES, LEAD_STAGES, LEAD_STAGE_LABELS, superadminApi, type LeadActivity, type LeadDetail, type LeadInput, type LeadStage, type LeadTask, type LeadTemplateRendered, type Plan } from "@/lib/superadminApi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";
import { copyText, errMessage, fieldClass, fmtDate, rupiah } from "@/lib/leadUi";

// Everything about one lead: the info asked on the first follow-up, tasks, WhatsApp composer, contract, and the timeline.

const card = "rounded-2xl border border-fg/10 bg-fg/[0.03] p-4";
const label = "text-xs font-semibold uppercase tracking-[.12em] text-fg/45";
const PRESETS = [["3h", "3 jam"], ["1d", "Besok"], ["2d", "2 hari"], ["3d", "3 hari"], ["1w", "1 minggu"]] as const;
const TASK_TONE = { overdue: "text-red-600", today: "text-amber-700", upcoming: "text-fg/55", done: "text-fg/35" } as const;

const ACTIVITY_META: Record<LeadActivity["kind"], { icon: string; title: string }> = {
  note: { icon: "📝", title: "Catatan" }, call: { icon: "📞", title: "Panggilan" }, stage: { icon: "➜", title: "Tahap" }, whatsapp_out: { icon: "💬", title: "WhatsApp keluar" },
  whatsapp_in: { icon: "📩", title: "WhatsApp masuk" }, contract: { icon: "📄", title: "Kontrak" }, task: { icon: "✓", title: "Tugas" }, system: { icon: "•", title: "Sistem" },
};

function InfoForm({ detail, plans, onSaved }: { detail: LeadDetail; plans: Plan[]; onSaved: () => void }) {
  const l = detail.lead;
  const [d, setD] = useState<LeadInput>({});
  const [busy, setBusy] = useState(false);
  const locked = l.contractStatus === "signed";
  const val = <K extends keyof LeadInput>(k: K) => (k in d ? d[k] : (l as unknown as LeadInput)[k]);
  const set = (patch: LeadInput) => setD((x) => ({ ...x, ...patch }));
  const dirty = Object.keys(d).length > 0;
  const save = async () => {
    setBusy(true);
    try { await superadminApi.updateLead(l.id, d); setD({}); pushToast({ type: "success", title: "Info lead disimpan" }); onSaved(); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } finally { setBusy(false); }
  };
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <div className={card}>
      <p className={label}>Info follow-up</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-fg/60">Nama pemilik<input className={fieldClass} value={val("ownerName") ?? ""} onChange={(e) => set({ ownerName: e.target.value })} /></label>
        <label className="text-sm text-fg/60">WhatsApp<input className={fieldClass} value={val("ownerWhatsapp") ?? ""} onChange={(e) => set({ ownerWhatsapp: e.target.value })} /></label>
        <label className="text-sm text-fg/60">Email<input className={fieldClass} value={val("ownerEmail") ?? ""} onChange={(e) => set({ ownerEmail: e.target.value })} /></label>
        <label className="text-sm text-fg/60">Kota<input className={fieldClass} value={val("city") ?? ""} onChange={(e) => set({ city: e.target.value })} /></label>
        <label className="text-sm text-fg/60">Sumber lead
          <select className={fieldClass} value={val("leadSource") ?? ""} onChange={(e) => set({ leadSource: (e.target.value || null) as LeadInput["leadSource"] })}>
            <option value="">—</option>{LEAD_SOURCES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label className="text-sm text-fg/60">Jumlah booth<input type="number" min={1} disabled={locked} className={fieldClass} value={val("boothCount") ?? ""} onChange={(e) => set({ boothCount: num(e.target.value) })} /></label>
        <label className="text-sm text-fg/60">Lokasi booth<input className={fieldClass} placeholder="Mall / event / studio…" value={val("boothLocation") ?? ""} onChange={(e) => set({ boothLocation: e.target.value })} /></label>
        <label className="text-sm text-fg/60">Rencana mulai<input className={fieldClass} placeholder="mis. minggu kedua Desember" value={val("plannedStart") ?? ""} onChange={(e) => set({ plannedStart: e.target.value })} /></label>
        <label className="text-sm text-fg/60">Pembayaran booth
          <select disabled={locked} className={fieldClass} value={val("paymentSetup") ?? ""} onChange={(e) => set({ paymentSetup: (e.target.value || null) as LeadInput["paymentSetup"] })}>
            <option value="">Belum ditanyakan</option><option value="own">Akun sendiri (Midtrans/Xendit/DOKU)</option><option value="platform">Pakai platform STUDIODO</option>
          </select>
        </label>
        <label className="text-sm text-fg/60">Paket untuk kontrak
          <select disabled={locked} className={fieldClass} value={val("planSlug") ?? ""} onChange={(e) => set({ planSlug: e.target.value || null })}>
            <option value="">Pilih paket…</option>{plans.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-fg/60">Masa kontrak (bulan)<input type="number" min={1} max={60} disabled={locked} className={fieldClass} value={val("contractMonths") ?? ""} onChange={(e) => set({ contractMonths: num(e.target.value) })} /></label>
      </div>
      {locked && <p className="mt-2 text-xs text-fg/45">Kontrak sudah disetujui — jumlah booth, paket, masa kontrak, dan pembayaran terkunci.</p>}
      {dirty && <div className="mt-3 flex justify-end"><button type="button" disabled={busy} onClick={save} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white">{busy ? "Menyimpan…" : "Simpan info"}</button></div>}
    </div>
  );
}

function TasksCard({ detail, onChanged }: { detail: LeadDetail; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [custom, setCustom] = useState("");
  const add = async (preset?: string) => {
    if (!title.trim()) return pushToast({ type: "info", title: "Tulis dulu tugasnya" });
    try {
      await superadminApi.addLeadTask(detail.lead.id, preset ? { title, preset } : { title, dueAt: new Date(custom).toISOString() });
      setTitle(""); setCustom(""); onChanged();
    } catch (err) { pushToast({ type: "error", title: errMessage(err) }); }
  };
  const toggle = async (t: LeadTask) => { try { await superadminApi.updateLeadTask(detail.lead.id, t.id, { done: !t.doneAt }); onChanged(); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } };
  const remove = async (t: LeadTask) => { try { await superadminApi.deleteLeadTask(detail.lead.id, t.id); onChanged(); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } };
  return (
    <div className={card}>
      <p className={label}>Tugas follow-up</p>
      <ul className="mt-3 space-y-1.5">
        {detail.tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(t.doneAt)} onChange={() => void toggle(t)} aria-label={`Selesai: ${t.title}`} />
            <span className={t.doneAt ? "text-fg/35 line-through" : ""}>{t.title}</span>
            <span className={`ml-auto shrink-0 text-xs ${TASK_TONE[t.state]}`}>{t.state === "overdue" ? "Terlambat · " : ""}{fmtDate(t.dueAt)}</span>
            <button type="button" onClick={() => void remove(t)} className="text-xs text-fg/30 hover:text-red-500" aria-label="Hapus tugas">✕</button>
          </li>
        ))}
        {detail.tasks.length === 0 && <li className="text-sm text-fg/40">Belum ada tugas. Setiap lead yang masih jalan sebaiknya punya satu tugas berikutnya.</li>}
      </ul>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Tanya akun pembayaran, kirim kontrak…" className={`${fieldClass} mt-3`} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-fg/45">Ingatkan:</span>
        {PRESETS.map(([k, t]) => <button key={k} type="button" onClick={() => void add(k)} className="rounded-full border border-fg/15 px-3 py-1 text-xs font-semibold hover:border-accent">{t}</button>)}
        <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} className="rounded-lg border border-fg/15 bg-surface px-2 py-1 text-xs" />
        <button type="button" disabled={!custom} onClick={() => void add()} className="rounded-full bg-fg px-3 py-1 text-xs font-semibold text-canvas disabled:opacity-30">Atur</button>
      </div>
    </div>
  );
}

function WhatsAppCard({ detail, onChanged, onOpenSettings }: { detail: LeadDetail; onChanged: () => void; onOpenSettings: () => void }) {
  const [data, setData] = useState<{ templates: LeadTemplateRendered[]; gateway: boolean; phone: string | null } | null>(null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const id = detail.lead.id;
  // Re-render templates when anything they mention changes (contract link, booth count…).
  const depKey = `${detail.lead.contractStatus}|${detail.lead.boothCount}|${detail.lead.planSlug}|${detail.lead.ownerName}`;
  useEffect(() => { superadminApi.getLeadTemplates(id).then((r) => { if (r) { setData(r); } }).catch(() => undefined); }, [id, depKey]);
  const pick = (key: string) => { setPicked(key); const t = data?.templates.find((x) => x.key === key); if (t) setText(t.text); };
  const missing = data?.templates.find((t) => t.key === picked)?.missing ?? [];
  const send = async () => {
    setBusy(true);
    try { await superadminApi.sendLeadWhatsapp(id, text, "gateway"); setText(""); setPicked(""); pushToast({ type: "success", title: "Pesan terkirim" }); onChanged(); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); onChanged(); } finally { setBusy(false); }
  };
  const openWa = async () => {
    if (!data?.phone) return;
    window.open(`https://wa.me/${data.phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    try { await superadminApi.sendLeadWhatsapp(id, text, "manual"); onChanged(); } catch { /* the chat is already open; logging is best effort */ }
  };
  const phoneOk = Boolean(data?.phone);
  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <p className={label}>WhatsApp</p>
        <button type="button" onClick={onOpenSettings} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${data?.gateway ? "bg-emerald-500/15 text-emerald-700" : "bg-fg/8 text-fg/55"}`}>{data?.gateway ? "Gateway tersambung" : "Gateway belum diatur"}</button>
      </div>
      {!phoneOk && data && <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">Lead ini belum punya nomor WhatsApp yang valid — isi di Info follow-up.</p>}
      <select value={picked} onChange={(e) => pick(e.target.value)} className={`${fieldClass} mt-3`} disabled={!data}>
        <option value="">Pilih template pesan…</option>
        {data?.templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>
      <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis pesan atau pilih template di atas…" className={`${fieldClass} mt-2`} />
      {missing.length > 0 && <p className="mt-1 text-xs text-amber-700">Belum terisi: {missing.map((m) => `{${m}}`).join(", ")} — lengkapi data lead atau ubah teksnya.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={!text.trim() || !phoneOk || !data?.gateway || busy} onClick={send} title={data?.gateway ? "" : "Atur gateway di Pengaturan"} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-35">{busy ? "Mengirim…" : "Kirim lewat gateway"}</button>
        <button type="button" disabled={!text.trim() || !phoneOk} onClick={() => void openWa()} className="rounded-lg border border-fg/20 px-4 py-2 text-xs font-semibold disabled:opacity-35">Buka WhatsApp dengan pesan terisi</button>
      </div>
      {!data?.gateway && <p className="mt-2 text-[11px] text-fg/40">Tanpa gateway, tombol kedua membuka WhatsApp Anda dengan pesan siap kirim; setelah ditekan, pesan dicatat di riwayat.</p>}
    </div>
  );
}

function ContractCard({ detail, onChanged }: { detail: LeadDetail; onChanged: () => void }) {
  const l = detail.lead;
  const c = detail.contract;
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sent, setSent] = useState<{ url: string; message: string; waLink: string | null } | null>(null);
  const [preview, setPreview] = useState(false);
  useEffect(() => { setSent(null); }, [l.id]);
  useEffect(() => { setReviewed(false); }, [l.id, c?.status]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } finally { setBusy(false); } };
  const build = () => run(async () => { const r = await superadminApi.buildLeadContract(l.id); setWarnings(r?.warnings ?? []); setPreview(true); pushToast({ type: "success", title: "Draf kontrak dibuat" }); onChanged(); });
  const send = () => run(async () => { const r = await superadminApi.sendLeadContract(l.id); if (r) { setSent(r); pushToast({ type: "success", title: "Tautan kontrak aktif" }); onChanged(); } });
  const sign = () => { if (!window.confirm(`Catat kontrak ini sudah disetujui ${l.ownerName}? (mis. setuju lewat WhatsApp / tanda tangan kertas)`)) return; void run(async () => { await superadminApi.markLeadContractSigned(l.id); onChanged(); }); };
  const shownWarnings = c?.warnings?.length ? c.warnings : warnings;
  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <p className={label}>Surat kerja sama</p>
        {c && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.status === "signed" ? "bg-emerald-500/15 text-emerald-700" : c.status === "sent" ? "bg-orange-500/15 text-orange-700" : "bg-fg/8 text-fg/55"}`}>{c.status === "signed" ? "Disetujui" : c.status === "sent" ? "Terkirim" : "Draf"}</span>}
      </div>
      <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">Isi surat adalah <b>draf</b> dari tim produk, bukan nasihat hukum dan belum ditinjau penasihat hukum. Pemilik / penasihat hukum perlu memeriksanya sebelum dikirim ke calon tenant.</p>
      {!c && <p className="mt-3 text-sm text-fg/55">Dibuat dari data lead (paket, booth, masa kontrak, pembayaran), harga paket, diskon volume, dan kebijakan penarikan yang berlaku.</p>}
      {c && (
        <div className="mt-3 space-y-1 text-sm">
          <p><span className="text-fg/50">Nomor:</span> {c.number} · <span className="text-fg/50">Total:</span> <b>{rupiah(c.total)}</b></p>
          {c.sentAt && <p className="text-fg/60">Dikirim {fmtDate(c.sentAt)}</p>}
          {c.signedAt && <p className="text-emerald-700">Disetujui oleh {c.signedName} · {fmtDate(c.signedAt)}</p>}
        </div>
      )}
      {c?.status !== "signed" && shownWarnings.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-amber-700">{shownWarnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <div className="mt-3 flex flex-wrap gap-2">
        {c?.status !== "signed" && <button type="button" disabled={busy} onClick={() => void build()} className="rounded-lg border border-fg/20 px-3 py-2 text-xs font-semibold">{c ? "Perbarui draf dari data lead" : "Buat draf kontrak"}</button>}
        {c && <button type="button" onClick={() => setPreview((p) => !p)} className="rounded-lg border border-fg/20 px-3 py-2 text-xs font-semibold">{preview ? "Tutup pratinjau" : "Pratinjau"}</button>}
        {c?.status === "sent" && !c.signedAt && <button type="button" onClick={sign} className="rounded-lg border border-fg/20 px-3 py-2 text-xs font-semibold">Catat sudah disetujui</button>}
      </div>
      {c && c.status === "draft" && (
        <div className="mt-3 rounded-xl bg-fg/[0.04] p-3">
          <label className="flex items-start gap-2 text-xs text-fg/70"><input type="checkbox" className="mt-0.5" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> Saya sudah meninjau draf ini (pemilik / penasihat hukum) dan siap mengirimnya ke calon tenant.</label>
          <button type="button" disabled={!reviewed || busy} onClick={() => void send()} className="mt-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-35">Kirim (aktifkan tautan)</button>
        </div>
      )}
      {c && (c.status === "sent" || c.status === "signed") && c.url && (
        <div className="mt-3 rounded-xl bg-fg/[0.04] p-3 text-xs">
          <p className="break-all text-fg/70">{c.url}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={async () => pushToast({ type: (await copyText(c.url!)) ? "success" : "error", title: "Tautan kontrak disalin" })} className="rounded-lg border border-fg/20 px-3 py-1.5 font-semibold">Salin tautan</button>
            <a href={c.url} target="_blank" rel="noreferrer" className="rounded-lg border border-fg/20 px-3 py-1.5 font-semibold">Buka / cetak PDF</a>
            {sent?.waLink && <a href={sent.waLink} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white">Kirim lewat WhatsApp</a>}
          </div>
          {sent && <p className="mt-2 text-fg/50">Pesan siap kirim: “{sent.message}”</p>}
        </div>
      )}
      {preview && c && <iframe title="Pratinjau kontrak" sandbox="" srcDoc={c.html} className="mt-3 h-[480px] w-full rounded-xl border border-fg/15 bg-white" />}
    </div>
  );
}

function ConvertCard({ detail, onChanged }: { detail: LeadDetail; onChanged: () => void }) {
  const l = detail.lead;
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(l.businessName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kioskKey: string; adminEmail: string; message?: string } | null>(null);
  if (l.status === "converted") return <div className={card}><p className="text-sm font-semibold text-emerald-700">✓ Sudah jadi tenant aktif</p>{result && <KeyBox r={result} />}{result?.message && <LoginMessage leadId={l.id} initial={result.message} onChanged={onChanged} />}</div>;
  if (l.status === "rejected") return null;
  const submit = async () => {
    setBusy(true);
    try { const r = await superadminApi.convertApplication(l.id, { slug, password }); if (r) { setResult({ kioskKey: r.kioskKey, adminEmail: r.adminEmail, message: r.whatsappMessage }); pushToast({ type: "success", title: "Tenant dibuat" }); onChanged(); } } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } finally { setBusy(false); }
  };
  return (
    <div className={card}>
      <p className={label}>Jadikan tenant</p>
      {result ? <><KeyBox r={result} />{result.message && <LoginMessage leadId={l.id} initial={result.message} onChanged={onChanged} />}</> : !open ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-sm text-fg/55">Membuat akun admin, paket awal, dan key trial.</p>
          <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-fg px-4 py-2 text-xs font-semibold text-canvas">Buat tenant</button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {!l.ownerEmail && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">Isi email pemilik di Info follow-up dulu — dipakai untuk login admin tenant.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-fg/60">Slug tenant<input className={fieldClass} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} /></label>
            <label className="text-sm text-fg/60">Password admin awal<input type="password" autoComplete="new-password" className={fieldClass} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter" /></label>
          </div>
          <div className="flex gap-2"><button type="button" disabled={busy || !slug || password.length < 6 || !l.ownerEmail} onClick={submit} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-35">{busy ? "Membuat…" : "Buat tenant"}</button><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-fg/20 px-4 py-2 text-xs">Batal</button></div>
        </div>
      )}
    </div>
  );
}

/** The "pengajuan disetujui" WhatsApp message with login + trial key, ready to send (or to open in WhatsApp). Only exists right after conversion: the key is not recoverable afterwards. */
function LoginMessage({ leadId, initial, onChanged }: { leadId: string; initial: string; onChanged: () => void }) {
  const [text, setText] = useState(initial);
  const [gateway, setGateway] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { superadminApi.getLeadTemplates(leadId).then((r) => { if (r) { setGateway(r.gateway); setPhone(r.phone); } }).catch(() => undefined); }, [leadId]);
  const send = async () => {
    setBusy(true);
    try { await superadminApi.sendLeadWhatsapp(leadId, text, "gateway"); pushToast({ type: "success", title: "Pesan login & key terkirim" }); onChanged(); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } finally { setBusy(false); }
  };
  const open = async () => {
    if (!phone) return;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    try { await superadminApi.sendLeadWhatsapp(leadId, text, "manual"); onChanged(); } catch { /* best effort */ }
  };
  return (
    <div className="mt-3 rounded-xl border border-fg/10 bg-surface p-3">
      <p className={label}>Pesan login & key trial untuk tenant</p>
      <textarea rows={11} value={text} onChange={(e) => setText(e.target.value)} className={`${fieldClass} mt-2 font-mono text-xs`} />
      <p className="mt-1 text-[11px] text-fg/45">Berisi tautan atur kata sandi (sekali pakai, 7 hari) dan key trial. Password yang Anda isi tidak ikut dikirim. Key tidak disimpan di riwayat chat. Pesan ini hanya ada sekarang; sebelum menutup halaman, kirim atau salin.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={!gateway || !phone || busy} onClick={() => void send()} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-35">{busy ? "Mengirim…" : "Kirim lewat gateway"}</button>
        <button type="button" disabled={!phone} onClick={() => void open()} className="rounded-lg border border-fg/20 px-4 py-2 text-xs font-semibold disabled:opacity-35">Buka WhatsApp dengan pesan terisi</button>
        <button type="button" onClick={async () => pushToast({ type: (await copyText(text)) ? "success" : "error", title: "Pesan disalin" })} className="rounded-lg border border-fg/20 px-4 py-2 text-xs font-semibold">Salin</button>
      </div>
      {!phone && <p className="mt-2 text-xs text-amber-700">Lead ini belum punya nomor WhatsApp yang valid.</p>}
    </div>
  );
}

function KeyBox({ r }: { r: { kioskKey: string; adminEmail: string } }) {
  return (
    <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
      <p className="text-sm font-semibold text-emerald-800">Tenant dibuat · admin {r.adminEmail}</p>
      <code className="mt-2 block overflow-x-auto rounded-lg bg-black/70 px-3 py-2 text-xs text-white">{r.kioskKey}</code>
      <p className="mt-1 text-xs text-emerald-900/70">Key kiosk hanya tampil sekali. Kirim lewat WhatsApp (template “Kirim key trial”) atau salin sekarang.</p>
    </div>
  );
}

function Timeline({ detail, onChanged }: { detail: LeadDetail; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [call, setCall] = useState(false);
  const add = async () => { try { await superadminApi.addLeadNote(detail.lead.id, text, call ? "call" : "note"); setText(""); onChanged(); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } };
  return (
    <div className={card}>
      <p className={label}>Riwayat</p>
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis catatan, hasil telepon, atau kesepakatan…" className={`${fieldClass} mt-3`} />
      <div className="mt-2 flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-fg/60"><input type="checkbox" checked={call} onChange={(e) => setCall(e.target.checked)} /> Ini hasil panggilan</label>
        <button type="button" disabled={!text.trim()} onClick={() => void add()} className="ml-auto rounded-lg bg-fg px-4 py-1.5 text-xs font-semibold text-canvas disabled:opacity-30">Simpan catatan</button>
      </div>
      <ol className="mt-4 space-y-3">
        {detail.activities.map((a) => {
          const m = ACTIVITY_META[a.kind] ?? ACTIVITY_META.system;
          const failed = a.meta?.status === "failed";
          return (
            <li key={a.id} className={`flex gap-3 ${a.kind === "whatsapp_out" ? "" : ""}`}>
              <span className="mt-0.5 w-5 shrink-0 text-center text-sm">{m.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-fg/45">{m.title}{a.kind === "whatsapp_out" ? (a.meta?.via === "gateway" ? " · gateway" : " · wa.me") : ""}{failed ? " · GAGAL" : ""} · {a.actor ?? "—"} · {fmtDate(a.createdAt)}</p>
                <p className={`whitespace-pre-wrap break-words text-sm ${a.kind === "whatsapp_in" ? "rounded-xl bg-fg/[0.06] px-3 py-2" : a.kind === "whatsapp_out" ? "rounded-xl bg-emerald-500/10 px-3 py-2" : "text-fg/80"} ${failed ? "!bg-red-500/10" : ""}`}>{a.body}</p>
                {failed && typeof a.meta?.error === "string" && <p className="text-xs text-red-600">{a.meta.error}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function LeadDetailDrawer({ id, onClose, onChanged, onOpenSettings }: { id: string; onClose: () => void; onChanged: () => void; onOpenSettings: () => void }) {
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { const d = await superadminApi.getLead(id); if (d) setDetail(d); setError(""); } catch (err) { setError(errMessage(err)); }
  }, [id]);
  useEffect(() => { setDetail(null); void load(); }, [load]);
  useEffect(() => { superadminApi.getPlans().then((p) => setPlans(p ?? [])).catch(() => undefined); }, []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  const refresh = () => { void load(); onChanged(); };

  const move = async (stage: LeadStage) => {
    if (!detail) return;
    let reason: string | undefined;
    if (stage === "lost") { const r = window.prompt("Alasan batal? (opsional)"); if (r === null) return; reason = r || undefined; }
    try { await superadminApi.moveLead(id, stage, reason); refresh(); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); }
  };
  const remove = async () => {
    if (!detail || !window.confirm(`Hapus lead "${detail.lead.businessName}" beserta riwayatnya? Ini tidak bisa dibatalkan.`)) return;
    try { await superadminApi.deleteLead(id); onChanged(); onClose(); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); }
  };
  const l = detail?.lead;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/45" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="flex h-full w-full max-w-[1020px] flex-col bg-canvas shadow-2xl" role="dialog" aria-label="Detail lead">
        <header className="flex flex-wrap items-center gap-3 border-b border-fg/10 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-lg font-semibold">{l?.businessName ?? "Memuat…"}</h3>
            {l && <p className="truncate text-xs text-fg/50">{l.ownerName}{l.ownerWhatsapp ? ` · ${l.ownerWhatsapp}` : ""}{l.ownerEmail ? ` · ${l.ownerEmail}` : ""}{l.leadSource ? ` · via ${l.leadSource}` : ""}</p>}
          </div>
          {l && (
            <select value={l.pipelineStage} onChange={(e) => void move(e.target.value as LeadStage)} className="rounded-full border border-fg/20 bg-surface px-3 py-1.5 text-xs font-semibold" aria-label="Tahap pipeline">
              {LEAD_STAGES.map((s) => <option key={s} value={s} disabled={s === "active" && l.status !== "converted"}>{LEAD_STAGE_LABELS[s]}</option>)}
            </select>
          )}
          <button type="button" onClick={onClose} className="rounded-full border border-fg/20 px-3 py-1.5 text-xs font-semibold" aria-label="Tutup">Tutup ✕</button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          {!detail ? <div className="flex justify-center py-16"><Spinner size="md" /></div> : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                {l!.pipelineStage === "lost" && <p className="rounded-xl bg-fg/[0.06] px-4 py-3 text-sm">Batal{l!.lostReason ? `: ${l!.lostReason}` : ""}. Geser ke tahap lain untuk membukanya lagi.</p>}
                {l!.message && <div className={card}><p className={label}>Pesan dari form</p><p className="mt-2 whitespace-pre-wrap text-sm text-fg/75">“{l!.message}”</p></div>}
                <InfoForm detail={detail} plans={plans} onSaved={refresh} />
                <TasksCard detail={detail} onChanged={refresh} />
                <ContractCard detail={detail} onChanged={refresh} />
                <ConvertCard detail={detail} onChanged={refresh} />
                {l!.status !== "converted" && <button type="button" onClick={() => void remove()} className="text-xs text-red-500 hover:underline">Hapus lead ini</button>}
              </div>
              <div className="space-y-4">
                <WhatsAppCard detail={detail} onChanged={refresh} onOpenSettings={onOpenSettings} />
                <Timeline detail={detail} onChanged={refresh} />
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
