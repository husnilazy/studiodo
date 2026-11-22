import { useEffect, useState } from "react";
import { contentStudioApi, type CsMonthResult, type CsPost, type CsQueue, type CsStoryReel } from "@/lib/superadminApi";
import { PreviewModal, type PreviewTarget } from "./PreviewModal";
import { btnAccent, btnGhost, btnPrimary, Card, dayKey, dayLabel, errText, StatusChip, timeOf, Toggle, type Notice, NoticeLine } from "./shared";

// Ringkasan: what needs attention, what posts next, and the Autopilot switch.

export type Tab = "tinjau" | "bahan" | "ringkasan" | "generator" | "kalender" | "studio" | "aset" | "pengaturan";

function Stat({ value, label, tone, onClick }: { value: number | string; label: string; tone?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="rounded-2xl border border-fg/10 bg-fg/5 p-4 text-left transition hover:border-fg/30">
      <p className={`font-mono text-3xl font-bold leading-none ${tone ?? ""}`}>{value}</p>
      <p className="mt-2 text-xs font-semibold text-fg/55">{label}</p>
    </button>
  );
}

export function OverviewView({ queue, onChange, go }: { queue: CsQueue; onChange: () => Promise<void>; go: (t: Tab) => void }) {
  const { posts, settings, connected } = queue;
  const tz = settings.tzOffsetMin;
  const [busy, setBusy] = useState(false);
  const [n, setN] = useState<Notice>(null);
  const [reels, setReels] = useState<CsStoryReel[]>([]);
  useEffect(() => { contentStudioApi.storyReels().then((r) => setReels(r ?? [])).catch(() => undefined); }, [posts.length]);
  const queueReel = async (id: string) => {
    setN(null);
    try { await contentStudioApi.queueStoryReel(id); await onChange(); setN({ ok: true, text: "Reel masuk Kalender sebagai draf. Tinjau lalu setujui." }); } catch (e) { setN({ ok: false, text: errText(e) }); }
  };
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [replace, setReplace] = useState(true);
  const [month, setMonthRes] = useState<CsMonthResult | null>(null);
  const startMonth = async () => {
    setBusy(true); setN(null);
    try { const r = await contentStudioApi.monthProgram(replace); if (!r) throw new Error("Server tidak membalas"); setMonthRes(r); await onChange(); setN({ ok: true, text: `${r.created} post masuk jadwal (${r.reels} reel, ${r.carousels} carousel)${r.skipped ? `, ${r.skipped} jadwal lama dilewati` : ""}. Tayang otomatis jam 09:00, 14:00, dan 18:30.` }); }
    catch (e) { setN({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };
  const confirmKey = (key: string, on: boolean) => { const cur = settings.checkedKeys ?? []; void save({ checkedKeys: on ? [...new Set([...cur, key])] : cur.filter((k) => k !== key) }); };
  const until = settings.autopilotUntil ? new Date(settings.autopilotUntil) : null;
  const today = dayKey(new Date().toISOString(), tz);
  const count = (s: CsPost["status"]) => posts.filter((p) => p.status === s).length;
  const upcoming = posts.filter((p) => ["scheduled", "ready", "preparing", "posting"].includes(p.status)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(0, 5); // soonest first
  const postedMonth = posts.filter((p) => p.status === "posted" && p.postedAt && Date.now() - new Date(p.postedAt).getTime() < 30 * 86_400_000).length;
  const manualDue = posts.filter((p) => p.status === "ready" && p.mode === "manual" && new Date(p.scheduledAt).getTime() <= Date.now());

  const save = async (patch: Partial<typeof settings>) => {
    try { await contentStudioApi.saveSettings({ ...settings, ...patch }); await onChange(); } catch (e) { setN({ ok: false, text: errText(e) }); }
  };
  const fill = async () => {
    setBusy(true); setN(null);
    try {
      const made = (await contentStudioApi.autopilotRun(Math.ceil(settings.horizonDays / 7))) ?? [];
      await onChange();
      setN({ ok: true, text: made.length ? `${made.length} post baru masuk kalender${settings.autoApprove ? " dan langsung terjadwal." : " sebagai draf. Tinjau lalu setujui di tab Kalender."}` : "Semua fitur sudah punya jadwal, tidak ada yang perlu ditambah." });
    } catch (e) { setN({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4">
      {preview && <PreviewModal target={preview} onClose={() => setPreview(null)} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={count("draft")} label="Draf menunggu persetujuan" tone={count("draft") ? "text-amber-600" : ""} onClick={() => go("kalender")} />
        <Stat value={count("scheduled") + count("ready")} label="Terjadwal & siap tayang" onClick={() => go("kalender")} />
        <Stat value={postedMonth} label="Tayang 30 hari terakhir" onClick={() => go("kalender")} />
        <Stat value={count("failed") + posts.filter((p) => p.status === "posted" && p.igGone).length} label="Gagal / hilang dari IG, perlu dicek" tone={count("failed") + posts.filter((p) => p.status === "posted" && p.igGone).length ? "text-red-500" : ""} onClick={() => go("kalender")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          {manualDue.length > 0 && (
            <Card title="Waktunya posting manual" hint="Filenya sudah siap. Unduh, unggah ke Instagram, lalu tandai terposting.">
              {manualDue.map((p) => <p key={p.id} className="text-sm"><b>{timeOf(p.scheduledAt, tz)}</b> · {p.title}</p>)}
              <button className={`${btnPrimary} mt-3`} onClick={() => go("kalender")}>Buka kalender</button>
            </Card>
          )}
          <Card title="Tayang berikutnya" action={<button className={btnGhost} onClick={() => go("kalender")}>Semua jadwal</button>}>
            {upcoming.length === 0 ? <p className="text-sm text-fg/50">Belum ada post terjadwal.</p> : (
              <ul className="grid gap-2">
                {upcoming.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-xl bg-canvas/60 px-3 py-2.5">
                    <div className="w-24 shrink-0 text-xs"><p className="font-mono text-sm font-bold">{timeOf(p.scheduledAt, tz)}</p><p className="text-fg/50">{dayLabel(dayKey(p.scheduledAt, tz), today).replace(/^Hari ini · |^Besok · /, (m) => m.slice(0, -3) + " ")}</p></div>
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">{p.title}</p>
                    <StatusChip post={p} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {(queue.held?.length ?? 0) > 0 && (
            <Card title={`Perlu kamu cek dulu (${queue.held!.length})`} hint="Konten ini tidak ikut autopilot sampai kamu centang 'sudah dicek'. Baca catatannya, pastikan fiturnya benar di akun live.">
              <ul className="grid max-h-80 gap-2 overflow-y-auto pr-1">
                {queue.held!.map((h) => (
                  <li key={h.key} className="flex items-start gap-3 rounded-xl border border-fg/10 p-3 text-sm">
                    <input type="checkbox" className="mt-1" checked={false} onChange={(e) => confirmKey(h.key, e.target.checked)} />
                    <span><b>{h.label}</b><br /><span className="text-xs text-fg/55">{h.note}</span></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Reel cerita" hint="Reel bersuara (VO + musik + efek). Masuk Kalender sebagai draf; dirender di PC saat mendekati jadwal.">
            <ul className="grid max-h-80 gap-2 overflow-y-auto pr-1">
              {reels.map((r) => (
                <li key={r.id} className="rounded-xl bg-canvas/60 px-3 py-2.5">
                  <p className="text-sm font-semibold">{r.title}</p>
                  <p className="text-xs text-fg/55">CTA: {r.cta} · musik: {r.music}</p>
                  {r.needsCheck && <p className="mt-1 text-xs text-amber-700">Cek dulu: {r.needsCheck}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2"><button className={btnAccent} onClick={() => setPreview({ title: r.title, storyReelId: r.id })}>▶ Tonton</button>{r.queued.length ? <span className="text-xs text-emerald-700">Sudah di kalender ({r.queued[0].status})</span> : <button className={btnGhost} onClick={() => void queueReel(r.id)}>Antrekan sebagai draf</button>}</div>
                </li>
              ))}
              {reels.length === 0 && <p className="text-sm text-fg/50">Belum ada reel cerita.</p>}
            </ul>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card title="Instagram">
            {connected ? (
              <p className="flex items-center gap-2 text-sm"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Tersambung. Post bermode Auto tayang otomatis.</p>
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Belum tersambung. Konten tetap bisa dibuat dan disiapkan untuk posting manual.</p>
                <button className={`${btnAccent} mt-3`} onClick={() => go("pengaturan")}>Sambungkan Instagram</button>
              </>
            )}
          </Card>
          <Card title="Program 1 bulan" hint="3 posting sehari: 09:00 reel, 14:00 carousel, 18:30 reel. Tayang otomatis, tanpa persetujuan satu per satu.">
            <div className="grid gap-3">
              {until && settings.autopilot && <p className="text-sm text-emerald-600">Aktif sampai {until.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}. Setelah itu autopilot berhenti mengisi kalender.</p>}
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={replace} onChange={(e) => setReplace(e.target.checked)} /><span>Lewati draf & jadwal autopilot lama yang belum tayang</span></label>
              <button className={btnPrimary} disabled={busy} onClick={startMonth}>{busy ? "Menyusun jadwal…" : until && settings.autopilot ? "Susun ulang program 1 bulan" : "Mulai program 1 bulan"}</button>
              {!connected && <p className="text-xs text-amber-600">Instagram belum tersambung: post tetap disiapkan tapi belum bisa tayang sendiri.</p>}
              {month && <p className="text-xs text-fg/55">{month.created} post: {month.reels} reel, {month.carousels} carousel.</p>}
            </div>
          </Card>
          <Card title="Autopilot" hint="Mengisi kalender dari katalog fitur: format & topik bergantian, tidak ada fitur yang terulang.">
            <div className="grid gap-3">
              <Toggle on={settings.autopilot} onChange={(v) => void save({ autopilot: v })} label="Isi kalender otomatis" hint={`Menjaga ${settings.horizonDays} hari ke depan selalu terisi`} />
              <Toggle on={settings.autoApprove} onChange={(v) => void save({ autoApprove: v })} label="Langsung setujui" hint="Mati = draf harus kamu setujui dulu (disarankan)" />
              <button className={btnPrimary} disabled={busy} onClick={fill}>{busy ? "Membuat konten…" : `Isi kalender sekarang (${Math.ceil(settings.horizonDays / 7)} minggu)`}</button>
              <NoticeLine n={n} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
