import { useState } from "react";
import { contentStudioApi, type CsPost, type CsQueue } from "@/lib/superadminApi";
import { btnAccent, btnGhost, btnPrimary, Card, dayKey, dayLabel, errText, StatusChip, timeOf, Toggle, type Notice, NoticeLine } from "./shared";

// Ringkasan: what needs attention, what posts next, and the Autopilot switch.

export type Tab = "ringkasan" | "generator" | "kalender" | "studio" | "aset" | "pengaturan";

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
  const today = dayKey(new Date().toISOString(), tz);
  const count = (s: CsPost["status"]) => posts.filter((p) => p.status === s).length;
  const upcoming = posts.filter((p) => ["scheduled", "ready", "preparing", "posting"].includes(p.status)).slice(0, 5);
  const month = posts.filter((p) => p.status === "posted" && p.postedAt && Date.now() - new Date(p.postedAt).getTime() < 30 * 86_400_000).length;
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={count("draft")} label="Draf menunggu persetujuan" tone={count("draft") ? "text-amber-600" : ""} onClick={() => go("kalender")} />
        <Stat value={count("scheduled") + count("ready")} label="Terjadwal & siap tayang" onClick={() => go("kalender")} />
        <Stat value={month} label="Tayang 30 hari terakhir" onClick={() => go("kalender")} />
        <Stat value={count("failed")} label="Gagal, perlu dicek" tone={count("failed") ? "text-red-500" : ""} onClick={() => go("kalender")} />
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
