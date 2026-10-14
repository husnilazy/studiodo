import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { contentStudioApi, type CsDeck, type CsPlan, type CsPlanItem, type CsPlanStatus } from "@/lib/superadminApi";

// Superadmin → Konten Instagram → Rencana & jadwal: what to post, in which order, on which day, with a checklist per post.
// Edits autosave (debounced) to the server; "Susun ulang jadwal" re-dates every post that is not live yet.

const inputClass = "mt-1 w-full rounded-lg border border-fg/15 bg-fg/5 px-3 py-2 text-sm outline-none focus:border-accent";

const POST_CHECKS: [string, string][] = [
  ["visual", "Visual dirender & dicek di ukuran HP"],
  ["caption", "Caption + hashtag siap"],
  ["hook", "Slide 1 punya hook yang jelas"],
  ["upload", "Diunggah / dijadwalkan di Instagram"],
  ["reply", "Balas komentar di 1 jam pertama"],
  ["insight", "Cek insight setelah 24 jam"],
];
const PROFILE_CHECKS: [string, string][] = [
  ["business", "Akun diubah ke Professional (Business/Creator) supaya ada insight"],
  ["avatar", "Foto profil memakai logo STUDIODO"],
  ["name", "Nama dan username konsisten (studiodo.id)"],
  ["bio", "Bio berisi: apa itu, untuk siapa, ajakan"],
  ["link", "Link di bio mengarah ke studiodo.id"],
  ["contact", "Tombol kontak (WhatsApp / email) aktif"],
  ["highlights", "Sorotan dibuat: Kenalan, Fitur, Cara Mulai, FAQ"],
  ["first", "3 post pertama sudah tayang sebelum mengajak follow"],
  ["notif", "Notifikasi komentar & DM aktif"],
];
const BIO = "Platform photobooth all-in-one 📸\nKiosk • QRIS • Kasir • Galeri hasil\nUntuk owner booth & penyelenggara event\n👇 Daftar di studiodo.id";

const STATUS: Record<CsPlanStatus, { label: string; tone: string }> = {
  ide: { label: "Ide", tone: "bg-fg/10 text-fg/60" },
  draf: { label: "Draf", tone: "bg-amber-500/20 text-amber-600" },
  siap: { label: "Siap posting", tone: "bg-sky-500/20 text-sky-600" },
  terjadwal: { label: "Terjadwal di IG", tone: "bg-violet-500/20 text-violet-500" },
  terposting: { label: "Sudah tayang", tone: "bg-emerald-500/20 text-emerald-600" },
};
const DAYS: [number, string][] = [[1, "Sen"], [2, "Sel"], [3, "Rab"], [4, "Kam"], [5, "Jum"], [6, "Sab"], [0, "Min"]];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const short = (s: string) => { const d = parse(s); return `${d.getDate()} ${MON[d.getMonth()]}`; };
const full = (s: string) => `${DOW[parse(s).getDay()]}, ${short(s)}`;
const weekStart = (s: string) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

type Filter = "all" | "todo" | "done" | "late";

export function ContentPlanPanel({ decks, onOpenDeck }: { decks: CsDeck[]; onOpenDeck: (id: string) => void }) {
  const [plan, setPlan] = useState<CsPlan | null>(null);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todo");
  const [newTitle, setNewTitle] = useState("");
  const [newFormat, setNewFormat] = useState<"carousel" | "reel" | "story">("carousel");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<CsPlan | null>(null);
  const today = ymd(new Date());

  useEffect(() => { contentStudioApi.plan().then((p) => { if (p) { setPlan(p); latest.current = p; } }).catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal memuat rencana" })); }, []);

  const flush = useCallback(async () => {
    if (!latest.current) return;
    setSave("saving");
    try { await contentStudioApi.savePlan(latest.current); setSave("saved"); } catch { setSave("error"); }
  }, []);
  // Autosave: any edit schedules one save 700 ms later; leaving the tab flushes immediately.
  const commit = useCallback((next: CsPlan) => {
    setPlan(next); latest.current = next; setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }, [flush]);
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void flush(); } }, [flush]);

  const edit = (fn: (p: CsPlan) => CsPlan) => { if (latest.current) commit(fn(latest.current)); };
  const patchItem = (id: string, fn: (i: CsPlanItem) => CsPlanItem) => edit((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? fn(i) : i)) }));
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  const deckTitle = (id?: string) => decks.find((d) => d.id === id)?.title;

  const reschedule = async () => {
    if (!plan) return;
    setBusy(true); setMessage(null);
    try {
      if (timer.current) clearTimeout(timer.current);
      const next = await contentStudioApi.reschedule(plan, { startDate: plan.startDate, days: plan.days, time: plan.time });
      if (next) { setPlan(next); latest.current = next; setSave("saved"); setMessage({ ok: true, text: "Jadwal disusun ulang. Post yang sudah tayang tidak berubah." }); }
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal menyusun jadwal" }); }
    finally { setBusy(false); }
  };

  const move = (idx: number, dir: -1 | 1) => {
    edit((p) => {
      const to = idx + dir;
      if (to < 0 || to >= p.items.length) return p;
      const items = [...p.items];
      [items[idx], items[to]] = [items[to], items[idx]];
      return { ...p, items };
    });
  };

  const isLate = (i: CsPlanItem) => !!i.date && i.date < today && i.status !== "terposting";
  const stats = useMemo(() => {
    const items = plan?.items ?? [];
    const done = items.filter((i) => i.status === "terposting").length;
    const late = items.filter(isLate).length;
    const next = items.filter((i) => i.status !== "terposting" && i.date).sort((a, b) => (a.date! + (a.time ?? "")).localeCompare(b.date! + (b.time ?? "")))[0];
    const lastDate = items.map((i) => i.date).filter(Boolean).sort().at(-1);
    return { total: items.length, done, late, next, lastDate };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, today]);

  const visible = useMemo(() => {
    const items = (plan?.items ?? []).map((item, idx) => ({ item, idx }));
    return items.filter(({ item }) => filter === "all" ? true : filter === "done" ? item.status === "terposting" : filter === "late" ? isLate(item) : item.status !== "terposting");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, filter, today]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof visible>();
    for (const row of visible) { const k = row.item.date ? weekStart(row.item.date) : "none"; m.set(k, [...(m.get(k) ?? []), row]); }
    const keys = [...m.keys()].filter((k) => k !== "none").sort();
    return [...keys.map((k) => [k, m.get(k)!] as const), ...(m.has("none") ? [["none", m.get("none")!] as const] : [])];
  }, [visible]);
  const baseWeek = useMemo(() => {
    const first = (plan?.items ?? []).map((it) => it.date).filter((d): d is string => !!d).sort()[0];
    return first ? weekStart(first) : null;
  }, [plan]);
  const weekNo = (k: string) => (baseWeek ? Math.round((parse(k).getTime() - parse(baseWeek).getTime()) / (7 * 86400000)) + 1 : 1);

  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => setMessage({ ok: true, text: `${what} disalin.` }));
  const scheduleText = () => (plan?.items ?? []).filter((i) => i.status !== "terposting").map((i) => `${i.date ? `${full(i.date)} ${i.time ?? ""}` : "Belum dijadwalkan"} — ${i.title} (${i.format}) [${STATUS[i.status].label}]`).join("\n");

  const addItem = () => {
    if (!newTitle.trim()) return;
    const item: CsPlanItem = { id: newId(), title: newTitle.trim(), phase: "Tambahan", pillar: "Lainnya", format: newFormat, status: "ide", checks: [] };
    edit((p) => ({ ...p, items: [...p.items, item] }));
    setNewTitle(""); setOpen(item.id);
  };

  if (!plan) return <p className="text-sm text-fg/50">{message ? message.text : "Memuat rencana…"}</p>;
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const profileDone = plan.profileChecks.length;

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      {/* ---- left: progress, settings, profile checklist, tips ---- */}
      <aside className="grid content-start gap-4">
        <div className="rounded-2xl border border-fg/10 bg-fg/5 p-4">
          <div className="flex items-end justify-between"><p className="text-sm font-bold">Progres launching</p><p className="text-xs text-fg/50">{stats.done} / {stats.total} tayang</p></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-fg/10"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
          <dl className="mt-3 grid gap-1.5 text-xs">
            <div className="flex justify-between"><dt className="text-fg/50">Berikutnya</dt><dd className="max-w-[200px] truncate text-right font-semibold">{stats.next ? `${full(stats.next.date!)} · ${stats.next.title}` : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-fg/50">Terlewat</dt><dd className={`font-semibold ${stats.late ? "text-amber-600" : ""}`}>{stats.late} post</dd></div>
            <div className="flex justify-between"><dt className="text-fg/50">Selesai sekitar</dt><dd className="font-semibold">{stats.lastDate ? short(stats.lastDate) : "—"}</dd></div>
          </dl>
          <p className="mt-2 text-[11px] text-fg/40">{save === "saving" ? "Menyimpan…" : save === "saved" ? "Tersimpan otomatis" : save === "error" ? "Gagal menyimpan, coba lagi" : "Perubahan tersimpan otomatis"}</p>
        </div>

        <div className="grid gap-3 rounded-2xl border border-fg/10 bg-fg/5 p-4">
          <p className="text-sm font-bold">Jadwal posting</p>
          <label className="text-xs font-semibold text-fg/60">Mulai tanggal<input type="date" className={inputClass} value={plan.startDate} onChange={(e) => e.target.value && edit((p) => ({ ...p, startDate: e.target.value }))} /></label>
          <div>
            <p className="text-xs font-semibold text-fg/60">Hari posting ({plan.days.length}× seminggu)</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DAYS.map(([d, l]) => (
                <button key={d} onClick={() => edit((p) => ({ ...p, days: toggle(p.days.map(String), String(d)).map(Number) }))} className={`rounded-full px-3 py-1.5 text-xs font-bold ${plan.days.includes(d) ? "bg-fg text-canvas" : "bg-fg/10 text-fg/60 hover:bg-fg/20"}`}>{l}</button>
              ))}
            </div>
          </div>
          <label className="text-xs font-semibold text-fg/60">Jam tayang<input type="time" className={inputClass} value={plan.time} onChange={(e) => e.target.value && edit((p) => ({ ...p, time: e.target.value }))} /></label>
          <button disabled={busy} onClick={reschedule} className="rounded-full bg-accent py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? "Menyusun…" : "Susun ulang jadwal"}</button>
          <p className="text-[11px] leading-relaxed text-fg/45">Menyusun ulang tanggal semua post yang belum tayang sesuai urutan daftar. Jam 19.00 hanyalah titik awal; setelah 2 minggu, lihat Insight Instagram (jam aktif follower) lalu sesuaikan.</p>
          <button onClick={() => copy(scheduleText(), "Jadwal")} className="rounded-full border border-fg/20 py-2 text-xs font-semibold hover:bg-fg/10">Salin jadwal (teks)</button>
          {message && <p className={`text-xs ${message.ok ? "text-emerald-600" : "text-red-500"}`}>{message.text}</p>}
        </div>

        <div className="rounded-2xl border border-fg/10 bg-fg/5 p-4">
          <div className="flex items-center justify-between"><p className="text-sm font-bold">Cek profil sebelum tayang</p><p className="text-xs text-fg/50">{profileDone} / {PROFILE_CHECKS.length}</p></div>
          <ul className="mt-2 grid gap-1.5">
            {PROFILE_CHECKS.map(([k, label]) => (
              <li key={k}><label className="flex cursor-pointer items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={plan.profileChecks.includes(k)} onChange={() => edit((p) => ({ ...p, profileChecks: toggle(p.profileChecks, k) }))} /><span className={plan.profileChecks.includes(k) ? "text-fg/40 line-through" : ""}>{label}</span></label></li>
            ))}
          </ul>
          <div className="mt-3 rounded-lg bg-fg/5 p-3">
            <p className="text-[11px] font-semibold text-fg/50">Saran bio</p>
            <p className="mt-1 whitespace-pre-line text-xs">{BIO}</p>
            <button onClick={() => copy(BIO, "Bio")} className="mt-2 rounded-full border border-fg/20 px-3 py-1 text-[11px] font-semibold hover:bg-fg/10">Salin bio</button>
          </div>
        </div>

        <div className="rounded-2xl border border-fg/10 bg-fg/5 p-4 text-xs leading-relaxed text-fg/70">
          <p className="mb-1.5 text-sm font-bold text-fg">Ritme yang disarankan</p>
          <ul className="grid list-disc gap-1 pl-4">
            <li>Fase 1 mengenalkan STUDIODO (apa itu, untuk siapa, cara mulai) sebelum fitur satu per satu.</li>
            <li>Campur format: carousel untuk penjelasan dan konten yang disimpan, Reel untuk menjangkau akun baru.</li>
            <li>Story harian ringan di luar jadwal ini: bagikan ulang post, polling, atau tanya jawab.</li>
            <li>Balas komentar dalam 1 jam pertama setelah tayang.</li>
            <li>Setelah 2 minggu, cek Insight: post mana yang paling banyak disimpan atau dibagikan, lalu perbanyak jenis itu.</li>
          </ul>
        </div>
      </aside>

      {/* ---- right: the schedule ---- */}
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {([["todo", "Belum tayang"], ["late", `Terlewat (${stats.late})`], ["done", "Sudah tayang"], ["all", "Semua"]] as [Filter, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-4 py-1.5 text-xs font-bold ${filter === k ? "bg-fg text-canvas" : "bg-fg/10 text-fg/60 hover:bg-fg/20"}`}>{l}</button>
          ))}
        </div>

        {groups.length === 0 && <p className="rounded-2xl border border-dashed border-fg/20 p-8 text-center text-sm text-fg/50">Tidak ada post di filter ini.</p>}

        <div className="grid gap-5">
          {groups.map(([week, rows]) => (
            <div key={week}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-fg/40">
                {week === "none" ? "Belum dijadwalkan" : `Minggu ke-${weekNo(week)} · ${short(week)} – ${short(ymd(new Date(parse(week).getTime() + 6 * 86400000)))}`}
                {rows[0] && week !== "none" && <span className="ml-2 font-medium normal-case tracking-normal text-fg/40">{rows[0].item.phase}</span>}
              </p>
              <div className="grid gap-2">
                {rows.map(({ item, idx }) => {
                  const done = item.checks.length;
                  const late = isLate(item);
                  const isToday = item.date === today;
                  const expanded = open === item.id;
                  const title = deckTitle(item.deckId);
                  return (
                    <div key={item.id} className={`rounded-xl border transition ${expanded ? "border-accent bg-accent/5" : isToday ? "border-accent/60 bg-fg/5" : late ? "border-amber-500/40 bg-amber-500/5" : "border-fg/10 bg-fg/5"}`}>
                      <div className="flex flex-wrap items-center gap-3 p-3">
                        <button onClick={() => setOpen(expanded ? null : item.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <span className={`w-[74px] shrink-0 rounded-lg px-2 py-1.5 text-center text-[11px] font-bold leading-tight ${isToday ? "bg-accent text-white" : "bg-fg/10"}`}>{item.date ? <>{DOW[parse(item.date).getDay()]}<br />{short(item.date)}</> : "—"}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{item.title}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-fg/50">
                              <span className="rounded-full bg-fg/10 px-2 py-0.5">{item.format === "reel" ? "Reel" : item.format === "story" ? "Story" : "Carousel"}</span>
                              <span>{item.pillar}</span>{item.time && <span>· {item.time}</span>}
                              {late && <span className="font-semibold text-amber-600">· terlewat</span>}
                              {isToday && item.status !== "terposting" && <span className="font-semibold text-accent">· hari ini</span>}
                            </span>
                          </span>
                        </button>
                        <span className="text-[11px] font-semibold text-fg/50">{done}/{POST_CHECKS.length}</span>
                        <select value={item.status} onChange={(e) => patchItem(item.id, (i) => ({ ...i, status: e.target.value as CsPlanStatus }))} className={`rounded-full border-0 px-3 py-1.5 text-xs font-bold outline-none ${STATUS[item.status].tone}`}>
                          {(Object.keys(STATUS) as CsPlanStatus[]).map((s) => <option key={s} value={s} className="text-black">{STATUS[s].label}</option>)}
                        </select>
                      </div>
                      {expanded && (
                        <div className="grid gap-4 border-t border-fg/10 p-4 lg:grid-cols-2">
                          <div>
                            <p className="mb-2 text-xs font-bold text-fg/60">Checklist posting</p>
                            <ul className="grid gap-1.5">
                              {POST_CHECKS.map(([k, label]) => (
                                <li key={k}><label className="flex cursor-pointer items-center gap-2 text-xs"><input type="checkbox" checked={item.checks.includes(k)} onChange={() => patchItem(item.id, (i) => ({ ...i, checks: toggle(i.checks, k) }))} /><span className={item.checks.includes(k) ? "text-fg/40 line-through" : ""}>{label}</span></label></li>
                              ))}
                            </ul>
                          </div>
                          <div className="grid content-start gap-3">
                            <div className="grid grid-cols-2 gap-3">
                              <label className="text-xs font-semibold text-fg/60">Tanggal<input type="date" className={inputClass} value={item.date ?? ""} onChange={(e) => patchItem(item.id, (i) => ({ ...i, date: e.target.value || undefined }))} /></label>
                              <label className="text-xs font-semibold text-fg/60">Jam<input type="time" className={inputClass} value={item.time ?? ""} onChange={(e) => patchItem(item.id, (i) => ({ ...i, time: e.target.value || undefined }))} /></label>
                            </div>
                            <label className="text-xs font-semibold text-fg/60">Catatan<textarea rows={3} className={inputClass} placeholder="Ide hook, mention, link, hasil insight…" value={item.notes ?? ""} onChange={(e) => patchItem(item.id, (i) => ({ ...i, notes: e.target.value }))} /></label>
                            <div className="flex flex-wrap gap-2">
                              {item.deckId && title && <button onClick={() => onOpenDeck(item.deckId!)} className="rounded-full bg-fg px-4 py-1.5 text-xs font-bold text-canvas">Buka di Studio</button>}
                              {item.deckId && !title && <span className="text-[11px] text-amber-600">Deck "{item.deckId}" tidak ditemukan</span>}
                              <button onClick={() => move(idx, -1)} disabled={idx === 0} className="rounded-full bg-fg/10 px-3 py-1.5 text-xs font-semibold disabled:opacity-30">↑ Prioritas naik</button>
                              <button onClick={() => move(idx, 1)} disabled={idx === plan.items.length - 1} className="rounded-full bg-fg/10 px-3 py-1.5 text-xs font-semibold disabled:opacity-30">↓ Turun</button>
                              <button onClick={() => { if (window.confirm(`Hapus "${item.title}" dari rencana?`)) { edit((p) => ({ ...p, items: p.items.filter((i) => i.id !== item.id) })); setOpen(null); } }} className="rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-500">Hapus</button>
                            </div>
                            <p className="text-[11px] text-fg/40">Mengubah urutan tidak mengubah tanggal. Klik "Susun ulang jadwal" untuk menerapkannya.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-2 rounded-2xl border border-dashed border-fg/20 p-4 sm:grid-cols-[1fr_130px_auto]">
          <input className={inputClass + " !mt-0"} placeholder="Tambah post sendiri (mis. Story pengumuman, repost testimoni)…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} />
          <select className={inputClass + " !mt-0"} value={newFormat} onChange={(e) => setNewFormat(e.target.value as "carousel" | "reel" | "story")}><option value="carousel">Carousel</option><option value="reel">Reel</option><option value="story">Story</option></select>
          <button disabled={!newTitle.trim()} onClick={addItem} className="rounded-full bg-fg px-5 py-2 text-xs font-bold text-canvas disabled:opacity-40">+ Tambah</button>
        </div>
      </section>
    </div>
  );
}
