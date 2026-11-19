import { useMemo, useState } from "react";
import Select from "@/components/Select";
import { contentStudioApi, type CsDeck, type CsSettings } from "@/lib/superadminApi";
import { btnGhost, btnPrimary, errText, Field, fromLocalInput, inputClass, toLocalInput, type Notice, NoticeLine } from "./shared";

/** Next free posting slot (first configured time on a configured weekday after now). */
export function nextSlot(s: CsSettings, takenIso: string[]): string {
  const taken = new Set(takenIso);
  const start = Date.now();
  for (let i = 0; i < 90; i++) {
    for (const t of [...s.times].sort()) {
      const day = new Date(start + i * 86_400_000 + s.tzOffsetMin * 60_000);
      const key = day.toISOString().slice(0, 10);
      if (!s.days.includes(day.getUTCDay())) continue;
      const iso = fromLocalInput(`${key}T${t}`, s.tzOffsetMin);
      if (new Date(iso).getTime() > start + 5 * 60_000 && !taken.has(iso)) return iso;
    }
  }
  return new Date(start + 86_400_000).toISOString();
}

export function ScheduleDialog({ deck, settings, takenIso, connected, onClose, onDone }: {
  deck: CsDeck; settings: CsSettings; takenIso: string[]; connected: boolean; onClose: () => void; onDone: (msg: string) => void;
}) {
  const tz = settings.tzOffsetMin;
  const [when, setWhen] = useState(() => toLocalInput(nextSlot(settings, takenIso), tz));
  const [mode, setMode] = useState<"auto" | "manual">(connected ? settings.defaultMode : "manual");
  const [busy, setBusy] = useState(false);
  const [n, setN] = useState<Notice>(null);
  const tooMany = deck.format === "carousel" && deck.slides.length > 10;
  const unsupported = deck.format === "highlight";
  const warn = useMemo(() => (deck.slides.length < 2 && deck.format === "carousel" ? "Carousel 1 slide akan tayang sebagai satu foto." : null), [deck]);

  const submit = async (status: "draft" | "scheduled") => {
    setBusy(true); setN(null);
    try {
      await contentStudioApi.schedule({ deckId: deck.id, scheduledAt: fromLocalInput(when, tz), mode, status });
      onDone(status === "draft" ? "Disimpan sebagai draf di Kalender." : "Dijadwalkan. Media dirender otomatis menjelang jam tayang.");
    } catch (e) { setN({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl border border-fg/15 bg-canvas p-5 shadow-2xl">
        <h3 className="text-base font-bold">Jadwalkan posting</h3>
        <p className="mt-0.5 truncate text-xs text-fg/50">{deck.title} · {deck.format === "reel" ? "Reel" : "Carousel"} · {deck.slides.length} slide</p>
        {(tooMany || unsupported) ? (
          <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600">{unsupported ? "Cover Sorotan tidak bisa diposting ke feed." : "Carousel Instagram maksimal 10 slide. Kurangi slide dulu."}</p>
        ) : (
          <div className="mt-4 grid gap-3">
            <Field label="Waktu tayang (WIB)"><input type="datetime-local" className={inputClass} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
            <Field label="Cara posting" hint={mode === "auto" ? "Server mengirim ke Instagram sendiri saat jam tayang." : "Server menyiapkan file; kamu unggah sendiri lalu tandai terposting."}>
              <Select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as "auto" | "manual")}>
                <option value="auto" disabled={!connected}>Auto-post{connected ? "" : " (Instagram belum tersambung)"}</option>
                <option value="manual">Manual (siapkan file saja)</option>
              </Select>
            </Field>
            {warn && <p className="text-xs text-amber-600">{warn}</p>}
            <NoticeLine n={n} />
            <div className="mt-1 flex flex-wrap justify-end gap-2">
              <button className={btnGhost} onClick={onClose}>Batal</button>
              <button className={btnGhost} disabled={busy} onClick={() => submit("draft")}>Simpan sebagai draf</button>
              <button className={btnPrimary} disabled={busy || !when} onClick={() => submit("scheduled")}>{busy ? "Menyimpan…" : "Jadwalkan"}</button>
            </div>
          </div>
        )}
        {(tooMany || unsupported) && <div className="mt-4 flex justify-end"><button className={btnGhost} onClick={onClose}>Tutup</button></div>}
      </div>
    </div>
  );
}
