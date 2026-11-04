import { useState } from "react";
import { useBoothConfig, type BoothConfig } from "@/lib/boothConfigStore";
import { inputClass, sectionClass } from "@/lib/adminUi";
import { pushToast } from "@/lib/toastStore";

type Draft = Pick<BoothConfig, "operatorPin" | "operatorEntryCorner" | "operatorEntryTaps">;
const pickDraft = (config: BoothConfig): Draft => ({
  operatorPin: config.operatorPin ?? "",
  operatorEntryCorner: config.operatorEntryCorner ?? "bl",
  operatorEntryTaps: config.operatorEntryTaps ?? 5,
});

const CORNERS: { id: Draft["operatorEntryCorner"]; label: string; pos: string }[] = [
  { id: "tl", label: "Kiri atas", pos: "left-2 top-2" },
  { id: "tr", label: "Kanan atas", pos: "right-2 top-2" },
  { id: "bl", label: "Kiri bawah", pos: "bottom-2 left-2" },
  { id: "br", label: "Kanan bawah", pos: "bottom-2 right-2" },
];

// How crew members get from the customer kiosk screen to the operator console (device tools). The admin proper still
// needs the tenant login, so the PIN here is a convenience gate for the on-site tools, not account security.
export default function OperatorAccessSettings() {
  const { config, update } = useBoothConfig();
  const [draft, setDraft] = useState<Draft>(() => pickDraft(config));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((key) => draft[key] !== (pickDraft(config) as Draft)[key]);
  const pinValid = draft.operatorPin === "" || /^[0-9]{4,8}$/.test(draft.operatorPin);

  const save = () => {
    if (!pinValid) return;
    update(draft);
    pushToast({ type: "success", title: "Akses operator tersimpan" });
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <section className={sectionClass}>
        <p className="eyebrow">AKSES OPERATOR</p>
        <h2 className="font-display text-xl font-semibold">Masuk dari layar kiosk</h2>
        <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Kru mengetuk pojok layar kiosk beberapa kali, memasukkan PIN, lalu konsol operator terbuka (diagnostik kamera, printer, server, sistem). Dari konsol ada tombol "Buka admin" yang tetap meminta login akun.</p>

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-sm text-fg/60">PIN operator (4 sampai 8 angka)</span>
            <input
              className={inputClass}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="Kosongkan = tanpa PIN"
              value={draft.operatorPin}
              onChange={(e) => set("operatorPin", e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
            />
          </label>
          {!pinValid && <p className="text-xs text-red-400">PIN harus 4 sampai 8 angka.</p>}
          {draft.operatorPin === "" && <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">Tanpa PIN, siapa pun yang menemukan ketukan rahasia bisa membuka konsol operator. Disarankan pasang PIN untuk booth di tempat umum.</p>}
          <p className="text-xs text-fg/45">PIN disimpan di PC ini saja, tidak ikut tersinkron ke server. Lima kali salah berturut-turut mengunci keypad selama 30 detik.</p>
        </div>
      </section>

      <section className={sectionClass}>
        <p className="eyebrow">KETUKAN RAHASIA</p>
        <h2 className="font-display text-xl font-semibold">Pojok &amp; jumlah ketukan</h2>
        <div className="mt-4 grid items-start gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
          <div className="relative mx-auto aspect-video w-40 rounded-xl border border-fg/15 bg-fg/[0.04]" aria-hidden>
            {CORNERS.map((corner) => <span key={corner.id} className={`absolute h-6 w-6 rounded-md border ${corner.pos} ${draft.operatorEntryCorner === corner.id ? "border-accent bg-accent/40" : "border-fg/15"}`} />)}
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {CORNERS.map((corner) => (
                <button key={corner.id} type="button" onClick={() => set("operatorEntryCorner", corner.id)} className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${draft.operatorEntryCorner === corner.id ? "border-accent bg-accent/10" : "border-fg/15 hover:border-fg/35"}`}>{corner.label}</button>
              ))}
            </div>
            <div>
              <span className="text-sm text-fg/60">Jumlah ketukan cepat (dalam 3 detik)</span>
              <div className="mt-1 flex gap-2">
                {([3, 5] as const).map((count) => (
                  <button key={count} type="button" onClick={() => set("operatorEntryTaps", count)} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${draft.operatorEntryTaps === count ? "border-accent bg-accent/10" : "border-fg/15 hover:border-fg/35"}`}>{count}x {count === 3 ? "(lebih cepat)" : "(lebih aman)"}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-fg/45">Cadangan: tombol Ctrl+Shift+O di keyboard juga membuka konsol operator (dengan PIN yang sama) dan Ctrl+Shift+A membuka admin.</p>
      </section>

      <div className="flex items-center gap-3 xl:col-span-2">
        <button type="button" onClick={save} disabled={!dirty || !pinValid} className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Simpan</button>
        {dirty && <button type="button" onClick={() => setDraft(pickDraft(config))} className="text-sm text-fg/50 hover:text-fg">Batalkan perubahan</button>}
      </div>
    </div>
  );
}
