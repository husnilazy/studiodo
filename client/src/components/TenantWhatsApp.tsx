import { useCallback, useEffect, useState } from "react";
import { superadminApi, type TenantWaAuto, type TenantWaData, type TenantWaOverview, type TenantWaStage } from "@/lib/superadminApi";
import { pushToast } from "@/lib/toastStore";
import { errMessage, fieldClass } from "@/lib/leadUi";
import Select from "@/components/Select";

// WhatsApp to existing tenants. Two pieces: a composer inside the tenant detail (manual: gateway or wa.me), and the
// "Pengingat WhatsApp otomatis" panel on the Tenant page (renewal reminders sent by the server, with a visible queue).

const card = "rounded-2xl border border-fg/10 bg-fg/5 p-4";
const label = "text-xs font-semibold uppercase tracking-[0.16em] text-fg/50";

export const STAGE_LABEL: Record<TenantWaStage, string> = { d7: "H-7", d3: "H-3", d1: "H-1", expired: "Sudah habis" };
const STAGE_TONE: Record<TenantWaStage, string> = { d7: "bg-sky-500/15 text-sky-700", d3: "bg-amber-500/15 text-amber-700", d1: "bg-orange-500/15 text-orange-700", expired: "bg-red-500/15 text-red-600" };

const HISTORY_LABEL: Record<string, string> = { "tenant.wa": "Terkirim", "tenant.wa.auto": "Otomatis", "tenant.wa.failed": "Gagal" };

export function TenantWhatsAppCard({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<TenantWaData | null>(null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [account, setAccount] = useState<{ email: string; hasKey: boolean; keyLabel: string | null; trialDays: number | null; missing: string[] } | null>(null);
  const load = useCallback(() => {
    setLoadError("");
    void superadminApi.getTenantWa(tenantId).then((r) => { if (r) setData(r); else setLoadError("Server tidak mengirim data."); }).catch((e) => setLoadError(errMessage(e)));
  }, [tenantId]);
  useEffect(() => { setData(null); setText(""); setPicked(""); setAccount(null); load(); }, [load]);

  // One click: login email + one-time password link + trial key, ready to send.
  const prepareAccount = async () => {
    setBusy(true);
    try {
      const r = await superadminApi.prepareTenantAccountMessage(tenantId);
      if (!r) return;
      setText(r.text); setPicked("account"); setAccount({ ...r.includes, missing: r.missing });
    } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } finally { setBusy(false); }
  };

  // The licence state suggests the right template up front (a tenant already past its end date gets the "habis" one).
  const suggested = data?.licenceStage === "expired" ? "expired" : data?.licenceStage ? "expiring" : "";
  const pick = (key: string) => {
    if (key === "account") { void prepareAccount(); return; } // needs the server: fresh password link + the booth key
    setPicked(key); setAccount(null);
    const t = data?.templates.find((x) => x.key === key);
    if (t) setText(t.text);
  };
  const missing = data?.templates.find((t) => t.key === picked)?.missing ?? [];
  const phoneOk = Boolean(data?.phone);

  const send = async () => {
    setBusy(true);
    try { await superadminApi.sendTenantWa(tenantId, text, "gateway"); setText(""); setPicked(""); pushToast({ type: "success", title: "Pesan WhatsApp terkirim" }); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } finally { setBusy(false); load(); }
  };
  const openWa = async () => {
    if (!data?.phone) return;
    window.open(`https://wa.me/${data.phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    try { await superadminApi.sendTenantWa(tenantId, text, "manual"); load(); } catch { /* chat already opened; logging is best effort */ }
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <p className={label}>Kirim WhatsApp ke tenant</p>
        {data && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${data.gateway ? "bg-emerald-500/15 text-emerald-700" : "bg-fg/10 text-fg/55"}`}>{data.gateway ? "Gateway tersambung" : "Gateway belum diatur"}</span>}
      </div>
      {!data && !loadError && <p className="mt-3 text-sm text-fg/40">Memuat…</p>}
      {!data && loadError && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">{loadError}<button type="button" onClick={load} className="ml-2 font-semibold underline">Coba lagi</button></p>}
      {data && !phoneOk && <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">Tenant ini belum punya nomor WhatsApp yang valid — isi di kolom <b>Profil bisnis</b> (WhatsApp pemilik), lalu simpan.</p>}
      {data && (
        <>
          {data.phone && <p className="mt-2 text-xs text-fg/45">Ke <b className="text-fg/70">{data.tenant.ownerName ?? "pemilik"}</b> · +{data.phone}</p>}
          <button type="button" disabled={busy} onClick={() => void prepareAccount()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent transition hover:bg-accent/20 disabled:opacity-50">
            ⚡ Isi otomatis: data akun & key trial
          </button>
          {account && (
            <ul className="mt-2 space-y-0.5 rounded-lg bg-fg/[0.05] px-3 py-2 text-xs text-fg/65">
              <li>✓ Email login: <b>{account.email}</b></li>
              <li>✓ Tautan atur password sekali pakai ({7} hari) — password tidak pernah dikirim</li>
              <li>{account.hasKey ? `✓ Key booth${account.keyLabel ? ` “${account.keyLabel}”` : ""}${account.trialDays !== null ? ` · trial ${account.trialDays} hari` : ""}` : "⚠️ Key booth tidak bisa ditampilkan (dibuat sebelum fitur lihat-ulang) — buat key baru di Booth & Lisensi"}</li>
              <li className="text-amber-700">Isi pesan ini rahasia: kirim hanya ke pemilik tenant.</li>
            </ul>
          )}
          <p className="mt-3 text-[11px] uppercase tracking-[.14em] text-fg/40">atau pilih template lain</p>
          <Select value={picked} onChange={(e) => pick(e.target.value)} className={`${fieldClass} mt-1`}>
            <option value="">Pilih template pesan…</option>
            <option value="account">🔑 Data akun & key trial (terisi otomatis)</option>
            {data.templates.map((t) => <option key={t.key} value={t.key}>{t.label}{t.key === suggested ? " — disarankan" : ""}</option>)}
          </Select>
          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis pesan atau pilih template di atas…" className={`${fieldClass} mt-2`} />
          {missing.length > 0 && <p className="mt-1 text-xs text-amber-700">Belum terisi: {missing.map((m) => `{${m}}`).join(", ")} — tenant belum punya data ini (mis. belum ada booth berlangganan). Ubah teksnya sebelum dikirim.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={!text.trim() || !phoneOk || !data.gateway || busy} onClick={() => void send()} title={data.gateway ? "" : "Atur gateway di Calon Tenant → Pengaturan"} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-35">{busy ? "Mengirim…" : "Kirim lewat gateway"}</button>
            <button type="button" disabled={!text.trim() || !phoneOk} onClick={() => void openWa()} className="rounded-lg border border-fg/20 px-4 py-2 text-xs font-semibold disabled:opacity-35">Buka WhatsApp dengan pesan terisi</button>
          </div>
          {!data.gateway && <p className="mt-2 text-[11px] text-fg/40">Tanpa gateway, tombol kedua membuka WhatsApp Anda dengan pesan siap kirim; setelah ditekan, pesan dicatat di riwayat di bawah.</p>}

          <p className={`${label} mt-5`}>Riwayat WhatsApp</p>
          <div className="mt-2 space-y-2">
            {data.history.map((h) => (
              <div key={h.id} className="rounded-xl bg-fg/[0.04] px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${h.action === "tenant.wa.failed" ? "bg-red-500/15 text-red-600" : h.action === "tenant.wa.auto" ? "bg-sky-500/15 text-sky-700" : "bg-emerald-500/15 text-emerald-700"}`}>{HISTORY_LABEL[h.action] ?? h.action}</span>
                  <span className="text-fg/40">{new Date(h.at).toLocaleString("id-ID")}{h.actor ? ` · ${h.actor}` : ""}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-fg/65">{typeof h.metadata?.text === "string" ? h.metadata.text : h.message}</p>
              </div>
            ))}
            {data.history.length === 0 && <p className="text-sm text-fg/40">Belum ada pesan WhatsApp ke tenant ini.</p>}
          </div>
        </>
      )}
    </div>
  );
}

/** Automatic renewal reminders: on/off, which stages, and the live queue so it is obvious what was (or will be) sent. */
export function TenantWaAutoPanel({ onOpenTenant }: { onOpenTenant?: (id: string) => void }) {
  const [data, setData] = useState<TenantWaOverview | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => { void superadminApi.getTenantWaOverview().then((r) => { if (r) setData(r); }).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (next: TenantWaAuto) => {
    setSaving(true);
    try {
      const r = await superadminApi.saveTenantWaAuto(next);
      if (r?.warning) pushToast({ type: "info", title: r.warning });
      else pushToast({ type: "success", title: next.enabled ? "Pengingat otomatis aktif" : "Pengingat otomatis dimatikan" });
      load();
    } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } finally { setSaving(false); }
  };
  const toggleStage = (s: TenantWaStage) => { if (!data) return; const has = data.auto.stages.includes(s); void save({ ...data.auto, stages: (has ? data.auto.stages.filter((x) => x !== s) : [...data.auto.stages, s]) as TenantWaStage[] }); };

  const queue = data?.upcoming ?? [];
  const pending = queue.filter((q) => !q.sent && q.phone).length;
  return (
    <div className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={label}>Pengingat WhatsApp otomatis</p>
          <p className="mt-1 max-w-xl text-sm text-fg/60">Kirim pesan perpanjangan ke pemilik tenant saat masa trial / langganan booth hampir habis dan setelah habis. Dikirim 08.00–20.00 WIB, sekali per tahap, memakai gateway WhatsApp.</p>
        </div>
        {data && (
          <button type="button" role="switch" aria-checked={data.auto.enabled} disabled={saving} onClick={() => void save({ ...data.auto, enabled: !data.auto.enabled })} className={`flex h-9 items-center gap-2 rounded-full px-4 text-xs font-semibold transition ${data.auto.enabled ? "bg-emerald-500 text-white" : "bg-fg/10 text-fg/60"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${data.auto.enabled ? "bg-white" : "bg-fg/30"}`} />{data.auto.enabled ? "Aktif" : "Mati"}
          </button>
        )}
      </div>
      {!data && <p className="mt-3 text-sm text-fg/40">Memuat…</p>}
      {data && (
        <>
          {!data.gateway && <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">Gateway WhatsApp belum diatur (Calon Tenant → Pengaturan). Selama belum, tidak ada pesan otomatis yang terkirim — Anda tetap bisa mengirim manual dari detail tenant.</p>}
          {data.auto.enabled && data.gateway && !data.sendingNow && <p className="mt-3 text-xs text-fg/50">Di luar jam kirim (08.00–20.00 WIB) — antrean berikut dikirim saat jam kirim tiba.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-fg/50">Tahap:</span>
            {(["d7", "d3", "d1", "expired"] as TenantWaStage[]).map((s) => {
              const on = data.auto.stages.includes(s);
              return <button key={s} type="button" disabled={saving} onClick={() => toggleStage(s)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-accent bg-accent/15 text-accent" : "border-fg/15 text-fg/45"}`}>{STAGE_LABEL[s]}</button>;
            })}
          </div>
          <p className={`${label} mt-5`}>Antrean ({queue.length}){data.auto.enabled && pending > 0 ? ` · ${pending} menunggu dikirim` : ""}</p>
          <div className="mt-2 divide-y divide-fg/10 rounded-xl border border-fg/10">
            {queue.map((q) => (
              <div key={q.tenantId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <button type="button" onClick={() => onOpenTenant?.(q.tenantId)} className="font-semibold hover:underline">{q.name}</button>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAGE_TONE[q.stage]}`}>{STAGE_LABEL[q.stage]}</span>
                <span className="text-xs text-fg/50">{q.kind === "trial" ? "Trial" : "Langganan"} · {q.booths} booth · berakhir {new Date(q.endsAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                <span className="ml-auto text-xs">
                  {!q.phone ? <span className="text-amber-700">Nomor WhatsApp belum diisi</span> : q.sent ? <span className="text-emerald-700">✓ Sudah dikirim</span> : data.auto.enabled && data.auto.stages.includes(q.stage) ? <span className="text-fg/55">Menunggu kirim</span> : <span className="text-fg/40">Tidak otomatis</span>}
                </span>
              </div>
            ))}
            {queue.length === 0 && <p className="px-3 py-3 text-sm text-fg/40">Tidak ada booth yang masa aktifnya mendekati habis dalam 7 hari (atau habis dalam 3 hari terakhir).</p>}
          </div>
        </>
      )}
    </div>
  );
}
