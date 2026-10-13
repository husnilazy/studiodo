// Automatic pre-checks shown to the reviewer next to each pending creator template. They never approve or reject
// anything by themselves: they point at the usual problems (slots outside the frame, overlapping windows, thin copy,
// a name that already exists in the catalog) so a review takes seconds and rejection notes can be specific.

export type CheckStatus = "ok" | "warn" | "fail";
export interface ReviewCheck { id: string; label: string; status: CheckStatus; detail: string }

export interface ReviewInput {
  name: string;
  description: string;
  canvasWidth: number;
  canvasHeight: number;
  orientation: string;
  slots: { x: number; y: number; w: number; h: number }[];
  hasFrame: boolean;
}

const overlapArea = (a: ReviewInput["slots"][number], b: ReviewInput["slots"][number]) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

export function reviewChecks(t: ReviewInput, existingNames: string[]): ReviewCheck[] {
  const out: ReviewCheck[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) => out.push({ id, label, status, detail });

  add("frame", "File frame", t.hasFrame ? "ok" : "fail", t.hasFrame ? `${t.canvasWidth} × ${t.canvasHeight} px` : "Tidak ada frame");

  const name = t.name.trim();
  const lowered = name.toLowerCase();
  const clash = existingNames.find((n) => n.trim().toLowerCase() === lowered);
  add("name", "Nama", !name || /^template (baru|tanpa judul)/i.test(name) ? "warn" : clash ? "warn" : "ok",
    !name || /^template (baru|tanpa judul)/i.test(name) ? "Nama masih bawaan — minta nama yang deskriptif" : clash ? `Sudah ada template bernama "${clash}" di katalog` : "Unik di katalog");

  const dlen = t.description.trim().length;
  add("description", "Deskripsi", dlen >= 30 ? "ok" : dlen >= 10 ? "warn" : "fail", dlen >= 30 ? `${dlen} karakter` : `${dlen} karakter — terlalu singkat untuk kartu katalog`);

  const n = t.slots.length;
  add("slots", "Jumlah slot foto", n === 0 ? "fail" : n > 8 ? "warn" : "ok", n === 0 ? "Tidak ada slot" : n > 8 ? `${n} slot — banyak, pastikan memang disengaja` : `${n} slot`);

  const outside = t.slots.filter((s) => s.x < 0 || s.y < 0 || s.x + s.w > t.canvasWidth + 1 || s.y + s.h > t.canvasHeight + 1).length;
  add("bounds", "Slot di dalam kanvas", outside ? "fail" : "ok", outside ? `${outside} slot keluar dari kanvas` : "Semua di dalam");

  let overlaps = 0;
  for (let i = 0; i < t.slots.length; i += 1) {
    for (let j = i + 1; j < t.slots.length; j += 1) {
      const area = overlapArea(t.slots[i], t.slots[j]);
      const smaller = Math.min(t.slots[i].w * t.slots[i].h, t.slots[j].w * t.slots[j].h);
      if (smaller > 0 && area / smaller > 0.1) overlaps += 1;
    }
  }
  add("overlap", "Slot saling tumpang tindih", overlaps ? "warn" : "ok", overlaps ? `${overlaps} pasang slot bertumpuk` : "Tidak ada");

  const canvas = t.canvasWidth * t.canvasHeight;
  const covered = canvas > 0 ? t.slots.reduce((sum, s) => sum + s.w * s.h, 0) / canvas : 0;
  add("coverage", "Area foto", covered < 0.15 ? "warn" : covered > 0.92 ? "warn" : "ok",
    `${Math.round(covered * 100)}% dari frame${covered < 0.15 ? " — sangat kecil, frame mungkin terlalu dominan" : covered > 0.92 ? " — hampir tanpa bingkai" : ""}`);

  const portrait = t.canvasHeight >= t.canvasWidth;
  add("orientation", "Orientasi sesuai ukuran", (t.orientation === "portrait") === portrait ? "ok" : "warn", `Dinyatakan ${t.orientation}, ukuran ${portrait ? "potret" : "lanskap"}`);

  return out;
}

export const REJECTION_PRESETS = [
  "Slot foto keluar dari area frame atau saling bertumpuk. Mohon rapikan posisi slot.",
  "Deskripsi terlalu singkat. Jelaskan tema dan cocok untuk acara apa.",
  "Resolusi frame terlalu rendah untuk dicetak tajam. Gunakan minimal 1200 px pada sisi terpendek.",
  "Desain mengandung logo/merek pihak lain tanpa izin. Gunakan karya orisinal.",
  "Nama template masih bawaan atau sama dengan template lain. Beri nama yang deskriptif.",
];
