import { useEffect, useState } from "react";
import { superadminApi, type GatewayInfo, type GatewaysOverview } from "@/lib/superadminApi";

// Superadmin → Pengaturan → "Pembayaran langganan": the gateways STUDIODO uses to collect subscription fees
// from tenants. Secrets are write-only (the server never sends them back, only a masked tail), checkout tries
// the gateways in priority order, and tenants fall back to contacting STUDIODO when none works.

const inputClass = "mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none focus:border-accent";
const when = (v: string) => new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const WHERE_TO_PASTE: Record<GatewayInfo["provider"], string> = {
  midtrans: "Dashboard Midtrans → Settings → Configuration → isi \"Payment Notification URL\" dengan URL ini, lalu simpan. Midtrans memverifikasi pembayaran dengan signature otomatis (tidak perlu token).",
  xendit: "Dashboard Xendit → Settings → Developers → Webhooks → isi URL ini untuk event \"Invoices paid\" dan \"Invoices expired\", lalu salin \"Webhook verification token\" ke kolom di bawah.",
};

function statusOf(g: GatewayInfo): { text: string; tone: string } {
  const complete = g.hasKey && (!g.needsWebhookToken || g.hasWebhookToken);
  if (!g.enabled) return { text: "Nonaktif", tone: "bg-white/10 text-white/50" };
  if (!complete) return { text: "Aktif, konfigurasi belum lengkap", tone: "bg-amber-500/20 text-amber-200" };
  // A key that the gateway itself rejected is not "ready", whatever the form says.
  if (g.lastTest && !g.lastTest.ok) return { text: "Aktif, tetapi tes koneksi terakhir gagal", tone: "bg-red-500/20 text-red-200" };
  if (!g.lastTest) return { text: "Aktif · belum dites", tone: "bg-amber-500/20 text-amber-200" };
  return { text: "Aktif & siap", tone: "bg-emerald-500/20 text-emerald-200" };
}

function GatewayCard({ gateway, onChanged }: { gateway: GatewayInfo; onChanged: () => void }) {
  const [enabled, setEnabled] = useState(gateway.enabled);
  const [priority, setPriority] = useState(String(gateway.priority));
  const [environment, setEnvironment] = useState(gateway.environment);
  const [secretKey, setSecretKey] = useState("");
  const [webhookToken, setWebhookToken] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const st = statusOf(gateway);
  const dirty = enabled !== gateway.enabled || Number(priority) !== gateway.priority || (gateway.provider === "midtrans" && environment !== gateway.environment) || !!secretKey || !!webhookToken;

  const save = async (extra: Parameters<typeof superadminApi.savePaymentGateway>[1] = {}) => {
    setBusy("save"); setMessage(null);
    try {
      await superadminApi.savePaymentGateway(gateway.provider, {
        enabled, priority: Number(priority), ...(gateway.provider === "midtrans" ? { environment } : {}),
        ...(secretKey ? { secretKey } : {}), ...(webhookToken ? { webhookToken } : {}), ...extra,
      });
      setSecretKey(""); setWebhookToken("");
      setMessage({ ok: true, text: "Tersimpan." });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal menyimpan" });
    } finally { setBusy(""); }
  };

  const test = async () => {
    setBusy("test"); setMessage(null);
    try {
      const r = await superadminApi.testPaymentGateway(gateway.provider);
      if (r) setMessage({ ok: r.ok, text: r.message });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal menjalankan tes" });
    } finally { setBusy(""); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(gateway.webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked — the URL is selectable below */ }
  };

  const keyHint = gateway.hasKey
    ? gateway.keySource === "environment" ? "Kunci dibaca dari environment server. Isi di sini untuk menggantinya." : `Tersimpan (${gateway.keyTail}). Kosongkan bila tidak ingin mengganti.`
    : "Belum ada kunci.";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-display text-lg font-semibold">{gateway.label}</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.tone}`}>{st.text}</span>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Aktifkan
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-white/60">
          Prioritas <span className="text-white/35">(angka kecil dicoba lebih dulu)</span>
          <input type="number" min={1} max={999} className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)} />
        </label>
        {gateway.provider === "midtrans" && (
          <label className="text-sm text-white/60">
            Mode
            <select className={inputClass} value={environment} onChange={(e) => setEnvironment(e.target.value as "sandbox" | "production")}>
              <option value="sandbox">Sandbox (uji coba)</option>
              <option value="production">Produksi (uang sungguhan)</option>
            </select>
          </label>
        )}
        <label className={`text-sm text-white/60 ${gateway.provider === "midtrans" ? "sm:col-span-2" : ""}`}>
          {gateway.provider === "midtrans" ? "Server Key" : "Secret Key"}
          <input type="password" autoComplete="new-password" className={inputClass} value={secretKey} onChange={(e) => setSecretKey(e.target.value)}
            placeholder={gateway.provider === "midtrans" ? "SB-Mid-server-… atau Mid-server-…" : "xnd_production_… atau xnd_development_…"} />
          <span className="mt-1 block text-xs text-white/35">{keyHint}</span>
        </label>
        {gateway.needsWebhookToken && (
          <label className="text-sm text-white/60 sm:col-span-2">
            Webhook verification token
            <input type="password" autoComplete="new-password" className={inputClass} value={webhookToken} onChange={(e) => setWebhookToken(e.target.value)} placeholder="Token dari Xendit → Webhooks" />
            <span className="mt-1 block text-xs text-white/35">{gateway.hasWebhookToken ? "Tersimpan. Kosongkan bila tidak ingin mengganti." : "Wajib: tanpa token, pembayaran Xendit tidak bisa dikonfirmasi otomatis."}</span>
          </label>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/45">URL webhook</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 select-all break-all text-xs text-accent">{gateway.webhookUrl}</code>
          <button type="button" onClick={copy} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15">{copied ? "Tersalin" : "Salin"}</button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-white/40">{WHERE_TO_PASTE[gateway.provider]}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy !== "" || !dirty} onClick={() => save()} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:opacity-40">{busy === "save" ? "Menyimpan…" : "Simpan"}</button>
        <button type="button" disabled={busy !== "" || !gateway.hasKey || dirty} onClick={test} title={dirty ? "Simpan perubahan dulu" : undefined} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15 disabled:opacity-40">{busy === "test" ? "Menguji…" : "Tes koneksi"}</button>
        {gateway.hasKey && gateway.keySource === "database" && (
          <button type="button" disabled={busy !== ""} onClick={() => { if (window.confirm(`Hapus kunci ${gateway.label} yang tersimpan?`)) void save({ clearSecretKey: true, ...(gateway.needsWebhookToken ? { clearWebhookToken: true } : {}), enabled: false }); }} className="rounded-xl px-3 py-2.5 text-sm text-red-300 hover:bg-red-500/15">Hapus kunci</button>
        )}
        {message && <span role="status" className={`text-sm ${message.ok ? "text-emerald-300" : "text-red-300"}`}>{message.text}</span>}
      </div>

      <div className="mt-4 grid gap-1 border-t border-white/10 pt-3 text-xs text-white/45">
        <div>Tes terakhir: {gateway.lastTest ? <span className={gateway.lastTest.ok ? "text-emerald-300" : "text-red-300"}>{gateway.lastTest.ok ? "berhasil" : "gagal"} · {when(gateway.lastTest.at)} — {gateway.lastTest.message}</span> : "belum pernah"}</div>
        <div>Webhook terakhir: {gateway.lastWebhook ? `${when(gateway.lastWebhook.at)} — ${gateway.lastWebhook.result}` : "belum ada yang masuk"}</div>
        <div>Order 30 hari: {gateway.orders30d.paid} lunas · {gateway.orders30d.pending} menunggu · {gateway.orders30d.failed} gagal · {gateway.orders30d.expired} kedaluwarsa</div>
      </div>
    </div>
  );
}

export function PaymentGatewaysPanel() {
  const [data, setData] = useState<GatewaysOverview | null>(null);
  const [error, setError] = useState("");

  const load = () => { superadminApi.getPaymentGateways().then((d) => { setData(d ?? null); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat")); };
  useEffect(load, []);

  const labelOf = (key: string) => data?.gateways.find((g) => g.provider === key)?.label ?? key;
  const chain = data ? [...data.checkoutOrder.map(labelOf), data.whatsappFallback ? "WhatsApp admin" : "pesan hubungi admin"] : [];

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6">
      <p className="text-xs uppercase tracking-[.16em] text-accent">PEMBAYARAN LANGGANAN</p>
      <h2 className="mt-2 font-display text-xl font-semibold">Gateway untuk membayar langganan tenant</h2>
      <p className="mt-1 text-sm text-white/45">Dipakai tenant di portal web saat memperpanjang langganan. Ini akun milik STUDIODO; QRIS di kiosk memakai akun Xendit tiap tenant (diatur di Admin tenant).</p>

      {error && <p role="alert" className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {!data && !error && <p role="status" className="mt-4 text-sm text-white/50">Memuat pengaturan pembayaran…</p>}

      {data && (
        <>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/45">Urutan checkout saat ini</div>
            <div className="mt-1 text-white/80">{data.checkoutOrder.length === 0 ? <span className="text-amber-200">Belum ada gateway yang siap — tenant hanya melihat cara menghubungi admin.</span> : chain.map((c, i) => <span key={c}>{i > 0 && <span className="px-2 text-white/30">→</span>}{c}</span>)}</div>
            <p className="mt-2 text-xs leading-relaxed text-white/40">Bila gateway pertama gagal atau menolak, checkout otomatis mencoba berikutnya. Jika semuanya gagal, tenant diminta menghubungi admin{data.whatsappFallback ? " lewat WhatsApp (nomor dari Pengaturan platform)" : " (isi nomor WhatsApp renewal di bagian Pengaturan platform agar tombolnya tampil)"}. Pembayaran yang sudah terlanjur dibayar tetap diterima walau gateway-nya dinonaktifkan.</p>
          </div>
          <div className="mt-5 grid gap-5">
            {data.gateways.map((g) => <GatewayCard key={`${g.provider}-${g.enabled}-${g.priority}-${g.environment}-${g.hasKey}-${g.hasWebhookToken}`} gateway={g} onChanged={load} />)}
          </div>
        </>
      )}
    </section>
  );
}
