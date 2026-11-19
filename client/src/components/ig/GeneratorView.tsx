import { useEffect, useMemo, useState } from "react";
import { contentStudioApi, type CsDeck, type CsFeature } from "@/lib/superadminApi";
import { btnGhost, btnPrimary, Card, errText, inputClass, type Notice, NoticeLine } from "./shared";

// Generator: pick features -> carousel and/or reel decks in the Contact Sheet style, ready to review and schedule.

export function GeneratorView({ decks, onGenerated, onOpenDeck, onSchedule }: {
  decks: CsDeck[]; onGenerated: () => Promise<void>; onOpenDeck: (id: string) => void; onSchedule: (deck: CsDeck) => void;
}) {
  const [data, setData] = useState<{ pillars: string[]; features: CsFeature[] } | null>(null);
  const [pillar, setPillar] = useState("Semua");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [formats, setFormats] = useState<Set<"carousel" | "reel">>(new Set(["carousel", "reel"]));
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<CsDeck[]>([]);
  const [n, setN] = useState<Notice>(null);

  useEffect(() => { contentStudioApi.features().then((d) => setData(d ?? null)).catch((e) => setN({ ok: false, text: errText(e) })); }, []);

  const has = (id: string, f: "carousel" | "reel") => decks.some((d) => d.featureId === id && d.format === f);
  const list = useMemo(() => (data?.features ?? []).filter((f) => (pillar === "Semua" || f.pillar === pillar) && (!q.trim() || `${f.name} ${f.tagline}`.toLowerCase().includes(q.trim().toLowerCase()))), [data, pillar, q]);
  const toggle = (id: string) => setPicked((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const allPicked = list.length > 0 && list.every((f) => picked.has(f.id));
  const total = picked.size * formats.size;
  const flagged = (data?.features ?? []).filter((f) => picked.has(f.id) && f.check);

  const generate = async () => {
    setBusy(true); setN(null);
    try {
      const out = (await contentStudioApi.generate([...picked], [...formats])) ?? [];
      setMade(out); setPicked(new Set());
      await onGenerated();
      setN({ ok: true, text: `${out.length} deck dibuat dan tersimpan di Studio.` });
    } catch (e) { setN({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };

  if (!data) return <p className="text-sm text-fg/50">{n ? <NoticeLine n={n} /> : "Memuat katalog fitur…"}</p>;
  return (
    <div className="grid gap-4">
      <Card title="Dari fitur jadi konten" hint={`${data.features.length} fitur STUDIODO sudah ditulis sebagai bahan konten. Pilih, lalu buat carousel dan reel gaya Contact Sheet sekaligus.`}>
        <div className="flex flex-wrap items-center gap-2">
          {["Semua", ...data.pillars].map((p) => (
            <button key={p} onClick={() => setPillar(p)} className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${pillar === p ? "bg-fg text-canvas" : "bg-fg/10 text-fg/70 hover:bg-fg/20"}`}>{p}</button>
          ))}
          <input className={`${inputClass} !mt-0 ml-auto max-w-[220px]`} placeholder="Cari fitur…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((f) => {
          const on = picked.has(f.id);
          return (
            <button key={f.id} onClick={() => toggle(f.id)} className={`group relative rounded-2xl border p-4 text-left transition ${on ? "border-accent bg-accent/10" : "border-fg/10 bg-fg/5 hover:border-fg/30"}`}>
              <span className={`absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-md border-2 text-xs font-black ${on ? "border-accent bg-accent text-white" : "border-fg/25"}`}>{on ? "✓" : ""}</span>
              <p className="text-[10px] font-bold uppercase tracking-wider text-fg/40">{f.pillar} · {f.since}</p>
              <p className="mt-1 pr-8 text-sm font-bold leading-snug">{f.emoji} {f.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-fg/55">{f.tagline}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
                <span className={`rounded-full px-2 py-0.5 ${has(f.id, "carousel") ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-fg/10 text-fg/45"}`}>{has(f.id, "carousel") ? "✓ " : ""}Carousel</span>
                <span className={`rounded-full px-2 py-0.5 ${has(f.id, "reel") ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-fg/10 text-fg/45"}`}>{has(f.id, "reel") ? "✓ " : ""}Reel</span>
                {f.check && <span title={f.check} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">⚠ cek klaim</span>}
              </div>
            </button>
          );
        })}
      </div>

      {made.length > 0 && (
        <Card title="Baru dibuat" hint="Sudah tersimpan di Studio. Tinjau desainnya, lalu jadwalkan.">
          <ul className="grid gap-2">
            {made.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas/60 px-3 py-2.5">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{d.title}</p>
                <button className={btnGhost} onClick={() => onOpenDeck(d.id)}>Buka di Studio</button>
                <button className={btnPrimary} onClick={() => onSchedule(d)}>Jadwalkan</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="sticky bottom-2 z-30 rounded-2xl border border-fg/15 bg-canvas/95 px-4 py-3 shadow-xl backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <button className={btnGhost} onClick={() => setPicked((s) => { const x = new Set(s); list.forEach((f) => (allPicked ? x.delete(f.id) : x.add(f.id))); return x; })}>{allPicked ? "Batal pilih semua" : `Pilih semua (${list.length})`}</button>
          <div className="flex gap-1 rounded-full bg-fg/10 p-1 text-xs font-bold">
            {(["carousel", "reel"] as const).map((f) => (
              <button key={f} onClick={() => setFormats((s) => { const x = new Set(s); if (x.has(f)) { if (x.size > 1) x.delete(f); } else x.add(f); return x; })} className={`rounded-full px-4 py-1.5 transition ${formats.has(f) ? "bg-fg text-canvas" : "text-fg/55"}`}>{f === "carousel" ? "Carousel" : "Reel"}</button>
            ))}
          </div>
          {flagged.length > 0 && <span className="text-xs text-amber-600">⚠ {flagged.length} fitur perlu dicek klaimnya sebelum tayang</span>}
          <NoticeLine n={n} />
          <button className={`${btnPrimary} ml-auto`} disabled={busy || total === 0} onClick={generate}>{busy ? "Membuat…" : total ? `Buat ${total} deck` : "Pilih fitur dulu"}</button>
        </div>
      </div>
    </div>
  );
}
