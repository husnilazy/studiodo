import { useCallback, useEffect, useState } from "react";
import { ContentPlanPanel } from "@/components/ContentPlanPanel";
import { IconPanel } from "@/components/IconPanel";
import { TeaserPanel } from "@/components/TeaserPanel";
import { TriptychPanel } from "@/components/TriptychPanel";
import { CalendarView } from "@/components/ig/CalendarView";
import { GeneratorView } from "@/components/ig/GeneratorView";
import { OverviewView, type Tab } from "@/components/ig/OverviewView";
import { ReviewView } from "@/components/ig/ReviewView";
import { ScheduleDialog } from "@/components/ig/ScheduleDialog";
import { SettingsView } from "@/components/ig/SettingsView";
import { StudioView } from "@/components/ig/StudioView";
import { errText, type Notice, NoticeLine } from "@/components/ig/shared";
import { contentStudioApi, type CsDeck, type CsIdea, type CsQueue } from "@/lib/superadminApi";

// Superadmin → Konten Instagram.
// Tinjau (HP: preview + setujui) · Ringkasan (status + Autopilot) · Generator (fitur → konten) · Kalender (jadwal & auto-post) · Studio (edit desain)
// · Aset profil (Pembuka Feed, Teaser, Logo, checklist peluncuran) · Pengaturan (koneksi Instagram, jadwal default).
// Rendering runs on the server PC (Chrome + ffmpeg): see server/lib/contentStudio.

const TABS: { id: Tab; label: string }[] = [
  { id: "tinjau", label: "Tinjau" }, { id: "ringkasan", label: "Ringkasan" }, { id: "generator", label: "Generator" }, { id: "kalender", label: "Kalender" },
  { id: "studio", label: "Studio desain" }, { id: "aset", label: "Aset profil" }, { id: "pengaturan", label: "Pengaturan" },
];
const ASSETS = [["trio", "Pembuka Feed (3 tile)"], ["teaser", "Teaser Reel"], ["icon", "Logo"], ["plan", "Checklist peluncuran"]] as const;

export function ContentStudioPanel() {
  const [tab, setTab] = useState<Tab>("tinjau");
  const [asset, setAsset] = useState<(typeof ASSETS)[number][0]>("trio");
  const [decks, setDecks] = useState<CsDeck[] | null>(null);
  const [ideas, setIdeas] = useState<CsIdea[]>([]);
  const [env, setEnv] = useState<{ chrome: string | null; ffmpeg: boolean } | null>(null);
  const [queue, setQueue] = useState<CsQueue | null>(null);
  const [openId, setOpenId] = useState<string | undefined>();
  const [toast, setToast] = useState<Notice>(null);
  const [scheduleDeck, setScheduleDeck] = useState<CsDeck | null>(null);

  const loadDecks = useCallback(async () => { const d = (await contentStudioApi.decks()) ?? []; setDecks(d); return d; }, []);
  const loadQueue = useCallback(async () => { const q = await contentStudioApi.queue(); if (q) setQueue(q); }, []);
  useEffect(() => {
    Promise.all([loadDecks(), contentStudioApi.ideas(), contentStudioApi.status(), loadQueue()])
      .then(([, i, e]) => { setIdeas(i ?? []); setEnv(e ?? null); })
      .catch((e) => setToast({ ok: false, text: `${errText(e, "Gagal memuat")}. Jika server baru diperbarui, jalankan build:server lalu restart service.` }));
  }, [loadDecks, loadQueue]);

  const openDeck = (id: string) => { setOpenId(id); setTab("studio"); };

  if (!decks || !queue) return <div className="grid gap-3"><p className="text-sm text-fg/50">Memuat…</p><NoticeLine n={toast} /></div>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <nav className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-fg/10 p-1 text-xs font-bold" aria-label="Bagian Konten Instagram">
        {TABS.map((t) => {
          const badge = t.id === "tinjau" ? queue.posts.filter((p) => p.status === "draft" || p.status === "failed").length : 0;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2 transition ${tab === t.id ? "bg-fg text-canvas" : "text-fg/60 hover:text-fg"}`}>
              {t.label}{badge > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-black">{badge}</span>}
            </button>
          );
        })}
      </nav>
      <NoticeLine n={toast} />

      {tab === "tinjau" && <ReviewView queue={queue} decks={decks} onChange={loadQueue} go={setTab} />}
      {tab === "ringkasan" && <OverviewView queue={queue} onChange={loadQueue} go={setTab} />}
      {tab === "generator" && <GeneratorView decks={decks} onGenerated={async () => { await loadDecks(); }} onOpenDeck={openDeck} onSchedule={setScheduleDeck} />}
      {tab === "kalender" && <CalendarView queue={queue} decks={decks} onChange={loadQueue} onOpenDeck={openDeck} />}
      {tab === "studio" && <StudioView decks={decks} ideas={ideas} env={env} queue={queue} openId={openId} reload={loadDecks} onScheduled={(m) => { setToast({ ok: true, text: m }); void loadQueue(); setTab("kalender"); }} />}
      {tab === "pengaturan" && <SettingsView settings={queue.settings} onChange={loadQueue} />}
      {tab === "aset" && (
        <div className="grid gap-4">
          <div className="flex w-fit flex-wrap gap-1.5">
            {ASSETS.map(([id, label]) => <button key={id} onClick={() => setAsset(id)} className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${asset === id ? "bg-accent text-white" : "bg-fg/10 text-fg/70 hover:bg-fg/20"}`}>{label}</button>)}
          </div>
          {asset === "trio" && <TriptychPanel />}
          {asset === "teaser" && <TeaserPanel />}
          {asset === "icon" && <IconPanel />}
          {asset === "plan" && <ContentPlanPanel decks={decks} onOpenDeck={openDeck} />}
        </div>
      )}

      {scheduleDeck && (
        <ScheduleDialog deck={scheduleDeck} settings={queue.settings} connected={queue.connected} takenIso={queue.posts.map((p) => p.scheduledAt)} onClose={() => setScheduleDeck(null)}
          onDone={(m) => { setScheduleDeck(null); setToast({ ok: true, text: m }); void loadQueue(); setTab("kalender"); }} />
      )}
    </div>
  );
}
