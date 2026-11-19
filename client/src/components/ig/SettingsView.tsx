import { useEffect, useState } from "react";
import Select from "@/components/Select";
import { contentStudioApi, type CsIgStatus, type CsIgTest, type CsSettings } from "@/lib/superadminApi";
import { btnGhost, btnPrimary, Card, DAY_NAMES, errText, Field, inputClass, type Notice, NoticeLine, Toggle } from "./shared";

// Pengaturan: Instagram connection, default posting schedule and autopilot behaviour.

export function SettingsView({ settings, onChange }: { settings: CsSettings; onChange: () => Promise<void> }) {
  const [s, setS] = useState(settings);
  const [ig, setIg] = useState<CsIgStatus | null>(null);
  const [userId, setUserId] = useState("");
  const [token, setToken] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [short, setShort] = useState("");
  const [choose, setChoose] = useState<{ igUserId: string; username: string; pageName: string }[] | null>(null);
  const [test, setTest] = useState<CsIgTest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [n, setN] = useState<Notice>(null);
  const [m, setM] = useState<Notice>(null);
  const [newTime, setNewTime] = useState("12:00");

  useEffect(() => setS(settings), [settings]);
  useEffect(() => { contentStudioApi.igStatus().then((r) => setIg(r ?? null)).catch(() => undefined); }, []);

  const saveSettings = async () => {
    setBusy("save"); setM(null);
    try { await contentStudioApi.saveSettings(s); await onChange(); setM({ ok: true, text: "Pengaturan tersimpan." }); } catch (e) { setM({ ok: false, text: errText(e) }); } finally { setBusy(null); }
  };
  const connect = async () => {
    setBusy("connect"); setN(null);
    try {
      const r = await contentStudioApi.igConnect(userId.trim(), token.trim());
      setN({ ok: true, text: `Tersambung ke @${r?.username ?? "akun Instagram"}.` });
      setToken(""); setUserId("");
      setIg((await contentStudioApi.igStatus()) ?? null); await onChange();
    } catch (e) { setN({ ok: false, text: errText(e) }); } finally { setBusy(null); }
  };
  const connectQuick = async (igUserId?: string) => {
    setBusy("quick"); setN(null);
    try {
      const r = await contentStudioApi.igConnectToken({ token: short.trim(), appId: appId.trim() || undefined, appSecret: appSecret.trim() || undefined, igUserId });
      if (r?.choose) { setChoose(r.choose); setN({ ok: true, text: "Ada lebih dari satu akun Instagram. Pilih yang dipakai." }); return; }
      setChoose(null); setShort(""); setAppSecret("");
      setN({ ok: true, text: `Tersambung ke @${r?.username ?? "akun Instagram"}. Tekan "Tes koneksi" berikutnya.` });
      setIg((await contentStudioApi.igStatus()) ?? null); await onChange();
    } catch (e) { setN({ ok: false, text: errText(e) }); } finally { setBusy(null); }
  };
  const disconnect = async () => {
    if (!window.confirm("Putuskan Instagram? Post bermode Auto akan berhenti di 'Siap tayang'.")) return;
    await contentStudioApi.igDisconnect(); setIg((await contentStudioApi.igStatus()) ?? null); setTest(null); await onChange();
  };
  const runTest = async () => {
    setBusy("test"); setTest(null);
    try { setTest((await contentStudioApi.igTest()) ?? null); } catch (e) { setN({ ok: false, text: errText(e) }); } finally { setBusy(null); }
  };
  const toggleDay = (d: number) => setS((x) => ({ ...x, days: x.days.includes(d) ? x.days.filter((v) => v !== d) : [...x.days, d] }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid content-start gap-4">
        <Card title="Koneksi Instagram" hint="Auto-post memakai Instagram Graph API resmi (akun Professional yang tertaut ke Halaman Facebook).">
          {ig?.connected ? (
            <div className="grid gap-3">
              <p className="flex items-center gap-2 text-sm"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Tersambung · ID {ig.userId} · token {ig.token} <span className="text-xs text-fg/40">({ig.source === "env" ? "dari .env" : "tersimpan di server"})</span></p>
              <div className="flex flex-wrap gap-2">
                <button className={btnPrimary} disabled={busy === "test"} onClick={runTest}>{busy === "test" ? "Menguji…" : "Tes koneksi"}</button>
                {ig.source === "file" && <button className={btnGhost} onClick={disconnect}>Putuskan</button>}
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3">
                <p className="text-xs font-bold">Cara cepat: dari token Graph API Explorer</p>
                <p className="text-[11px] text-fg/55">Server menukar token ke jangka panjang, mencari akun Instagram yang tertaut ke Halaman Facebook Anda, dan menyimpan token Halaman (tidak kedaluwarsa). ID aplikasi dan App Secret hanya dipakai sekali dan tidak disimpan.</p>
                <Field label="ID aplikasi Meta (angka)"><input className={inputClass} inputMode="numeric" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="1489447149793572" /></Field>
                <Field label="App Secret"><input className={inputClass} type="password" autoComplete="off" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} /></Field>
                <Field label="Token dari Graph API Explorer"><input className={inputClass} type="password" autoComplete="off" value={short} onChange={(e) => setShort(e.target.value)} placeholder="EAAB…" /></Field>
                <button className={btnPrimary} disabled={busy === "quick" || short.trim().length < 20} onClick={() => void connectQuick()}>{busy === "quick" ? "Menghubungkan…" : "Cari akun & sambungkan"}</button>
                {choose && (
                  <div className="grid gap-1.5">
                    {choose.map((c) => <button key={c.igUserId} className={btnGhost} disabled={busy === "quick"} onClick={() => void connectQuick(c.igUserId)}>@{c.username || c.igUserId} · Halaman {c.pageName}</button>)}
                  </div>
                )}
              </div>
              <details className="text-xs text-fg/60"><summary className="cursor-pointer font-semibold text-fg/80">Atau isi ID dan token sendiri</summary>
              <div className="mt-2 grid gap-3">
              <Field label="ID akun Instagram (angka)"><input className={inputClass} inputMode="numeric" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="17841400000000000" /></Field>
              <Field label="Access token (long-lived)"><input className={inputClass} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAB…" /></Field>
              <button className={btnPrimary} disabled={busy === "connect" || !userId || !token} onClick={connect}>{busy === "connect" ? "Memeriksa…" : "Sambungkan & periksa"}</button>
              </div></details>
              <button className={`${btnGhost} justify-self-start`} disabled={busy === "test"} onClick={runTest}>Tes alamat publik saja</button>
            </div>
          )}
          <NoticeLine n={n} />
          {test && (
            <ul className="mt-3 grid gap-1.5 text-xs">
              <li className={test.account ? "text-emerald-600" : "text-red-500"}>{test.account ? `✓ Akun terbaca: @${test.account}` : `✗ Akun: ${test.accountError}`}</li>
              <li className={test.urlOk ? "text-emerald-600" : "text-red-500"}>{test.urlOk ? `✓ Alamat publik terjangkau: ${test.mediaBase}` : `✗ Alamat publik ${test.mediaBase} tidak terjangkau (${test.urlError}). Instagram harus bisa mengunduh media dari sini; atur CS_MEDIA_BASE_URL di .env.`}</li>
            </ul>
          )}
          <details className="mt-4 text-xs text-fg/60">
            <summary className="cursor-pointer font-semibold text-fg/80">Cara mendapatkan ID & token</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 leading-relaxed">
              <li>Ubah akun Instagram jadi <b>Professional</b> (Business/Creator) dan tautkan ke sebuah Halaman Facebook.</li>
              <li>Buat aplikasi di developers.facebook.com, tambahkan produk Instagram, beri izin <code>instagram_basic</code>, <code>instagram_content_publish</code>, <code>pages_show_list</code>.</li>
              <li>Buat token Halaman/pengguna lalu tukar ke <b>long-lived token</b> (berlaku ±60 hari; ganti sebelum habis).</li>
              <li>ID akun = <code>instagram_business_account.id</code> dari Graph API Explorer. Atau isi <code>IG_USER_ID</code> &amp; <code>IG_ACCESS_TOKEN</code> di .env server.</li>
            </ol>
            <p className="mt-2">Fitur ini belum diuji dengan akun Instagram sungguhan. Pakai &ldquo;Tes koneksi&rdquo;, lalu coba satu post dulu.</p>
          </details>
        </Card>
      </div>

      <div className="grid content-start gap-4">
        <Card title="Jadwal default" hint="Dipakai Autopilot dan saran waktu saat menjadwalkan.">
          <div className="grid gap-4">
            <Field label="Hari posting">
              <div className="mt-1 flex flex-wrap gap-1.5">{[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <button key={d} onClick={() => toggleDay(d)} className={`h-9 w-12 rounded-full text-xs font-bold transition ${s.days.includes(d) ? "bg-fg text-canvas" : "bg-fg/10 text-fg/60 hover:bg-fg/20"}`}>{DAY_NAMES[d]}</button>
              ))}</div>
            </Field>
            <Field label="Jam posting (WIB)">
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {s.times.map((t) => <button key={t} onClick={() => s.times.length > 1 && setS((x) => ({ ...x, times: x.times.filter((v) => v !== t) }))} title="Klik untuk hapus" className="rounded-full bg-fg/10 px-3 py-1.5 font-mono text-xs font-bold hover:bg-red-500/15">{t} ×</button>)}
                <input type="time" className={`${inputClass} !mt-0 w-28`} value={newTime} onChange={(e) => setNewTime(e.target.value)} />
                <button className={btnGhost} onClick={() => newTime && !s.times.includes(newTime) && setS((x) => ({ ...x, times: [...x.times, newTime].sort() }))}>+ Tambah</button>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Reel tiap berapa post" hint="0 = tanpa reel"><input type="number" min={0} max={10} className={inputClass} value={s.reelEvery} onChange={(e) => setS({ ...s, reelEvery: Number(e.target.value) })} /></Field>
              <Field label="Maks post per hari" hint="Pengaman terhadap posting berlebih"><input type="number" min={1} max={25} className={inputClass} value={s.maxPerDay} onChange={(e) => setS({ ...s, maxPerDay: Number(e.target.value) })} /></Field>
              <Field label="Render sebelum tayang (menit)"><input type="number" min={5} className={inputClass} value={s.prepLeadMin} onChange={(e) => setS({ ...s, prepLeadMin: Number(e.target.value) })} /></Field>
              <Field label="Cara posting default"><Select className={inputClass} value={s.defaultMode} onChange={(e) => setS({ ...s, defaultMode: e.target.value as "auto" | "manual" })}><option value="auto">Auto-post</option><option value="manual">Manual</option></Select></Field>
            </div>
          </div>
        </Card>
        <Card title="Autopilot">
          <div className="grid gap-3">
            <Toggle on={s.autopilot} onChange={(v) => setS({ ...s, autopilot: v })} label="Isi kalender otomatis" hint="Server menambah post baru saat kalender lebih pendek dari rentang di bawah" />
            <Toggle on={s.autoApprove} onChange={(v) => setS({ ...s, autoApprove: v })} label="Setujui otomatis" hint="Aktifkan hanya jika kamu percaya penuh pada isi katalog. Default: draf perlu disetujui" />
            <Field label="Rentang kalender (hari ke depan)"><input type="number" min={3} max={90} className={inputClass} value={s.horizonDays} onChange={(e) => setS({ ...s, horizonDays: Number(e.target.value) })} /></Field>
          </div>
        </Card>
        <div className="flex items-center gap-3"><button className={btnPrimary} disabled={busy === "save"} onClick={saveSettings}>{busy === "save" ? "Menyimpan…" : "Simpan pengaturan"}</button><NoticeLine n={m} /></div>
      </div>
    </div>
  );
}
