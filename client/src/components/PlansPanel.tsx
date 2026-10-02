import { useEffect, useState } from "react";
import { superadminApi, type Plan } from "@/lib/superadminApi";
import { inputClass } from "@/lib/adminUi";
import { Icon } from "@/components/kiosk/Icons";

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const BILLING_LABEL: Record<string, string> = { monthly: "/bulan", yearly: "/tahun" };

type PlanDraft = {
  name: string;
  slug: string;
  price: string;
  billingInterval: "monthly" | "yearly";
  kioskLimit: string;
  screenBuilderEnabled: boolean;
  gifVideoEnabled: boolean;
  description: string;
  featured: boolean;
  featuresText: string;
  discountPercent: string;
  discountLabel: string;
  discountEndsAt: string; // yyyy-mm-dd
  yearlyDiscountPercent: string;
};

const EMPTY_DRAFT: PlanDraft = {
  name: "", slug: "", price: "", billingInterval: "monthly", kioskLimit: "", screenBuilderEnabled: true, gifVideoEnabled: true,
  description: "", featured: false, featuresText: "", discountPercent: "", discountLabel: "", discountEndsAt: "", yearlyDiscountPercent: "",
};

function draftFromPlan(plan: Plan): PlanDraft {
  return {
    name: plan.name, slug: plan.slug, price: String(Math.round(Number(plan.price))), billingInterval: plan.billingInterval,
    kioskLimit: plan.kioskLimit === null ? "" : String(plan.kioskLimit),
    screenBuilderEnabled: plan.screenBuilderEnabled, gifVideoEnabled: plan.gifVideoEnabled, description: plan.description ?? "",
    featured: plan.featured, featuresText: (plan.features ?? []).join("\n"),
    discountPercent: plan.discountPercent ? String(plan.discountPercent) : "", discountLabel: plan.discountLabel ?? "",
    discountEndsAt: plan.discountEndsAt ? plan.discountEndsAt.slice(0, 10) : "",
    yearlyDiscountPercent: plan.yearlyDiscountPercent ? String(plan.yearlyDiscountPercent) : "",
  };
}

function toPayload(draft: PlanDraft) {
  return {
    name: draft.name.trim(),
    price: Number(draft.price) || 0,
    billingInterval: draft.billingInterval,
    kioskLimit: draft.kioskLimit ? Number(draft.kioskLimit) : null,
    screenBuilderEnabled: draft.screenBuilderEnabled,
    gifVideoEnabled: draft.gifVideoEnabled,
    description: draft.description.trim(),
    featured: draft.featured,
    features: draft.featuresText.split("\n").map((line) => line.trim()).filter(Boolean),
    discountPercent: Number(draft.discountPercent) || 0,
    discountLabel: draft.discountLabel.trim(),
    // End of the chosen day, local time, so "berakhir 31 Okt" still counts on the 31st.
    discountEndsAt: draft.discountEndsAt ? new Date(`${draft.discountEndsAt}T23:59:59`).toISOString() : null,
    yearlyDiscountPercent: Number(draft.yearlyDiscountPercent) || 0,
  };
}

/** Same arithmetic as server/lib/planPricing.ts, just to preview what the numbers will become while typing. */
function previewPricing(draft: PlanDraft) {
  const base = Math.max(0, Number(draft.price) || 0);
  const percent = Math.max(0, Math.min(90, Math.round(Number(draft.discountPercent) || 0)));
  const yearlyPercent = Math.max(0, Math.min(90, Math.round(Number(draft.yearlyDiscountPercent) || 0)));
  const tidy = (value: number) => Math.round(value / 100) * 100;
  const promoFinal = percent > 0 ? tidy(base * (1 - percent / 100)) : base;
  if (draft.billingInterval === "yearly") return { monthly: null, yearly: { list: base, final: promoFinal } };
  const yearly = yearlyPercent > 0 && base > 0 ? { list: base * 12, final: tidy(promoFinal * 12 * (1 - yearlyPercent / 100)) } : null;
  return { monthly: { list: base, final: promoFinal }, yearly };
}

function PricePreview({ draft }: { draft: PlanDraft }) {
  const preview = previewPricing(draft);
  const line = (label: string, option: { list: number; final: number }) => (
    <p className="text-sm">
      <span className="text-fg/45">{label}: </span>
      {option.final !== option.list && <span className="mr-1.5 text-fg/35 line-through">{money(option.list)}</span>}
      <span className="font-semibold text-accent">{money(option.final)}</span>
      {option.final !== option.list && <span className="ml-1.5 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">hemat {Math.round((1 - option.final / option.list) * 100)}%</span>}
    </p>
  );
  return (
    <div className="rounded-xl border border-fg/10 bg-fg/[0.04] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg/40">Pratinjau harga di website</p>
      <div className="mt-1.5 space-y-0.5">
        {preview.monthly && line("Per bulan", preview.monthly)}
        {preview.yearly && line("Per tahun", preview.yearly)}
        {preview.yearly && preview.monthly && <p className="text-xs text-fg/45">Setara {money(Math.round(preview.yearly.final / 12))} per bulan.</p>}
        {!preview.yearly && draft.billingInterval === "monthly" && <p className="text-xs text-fg/40">Isi “Diskon langganan tahunan” untuk menampilkan pilihan Tahunan.</p>}
      </div>
    </div>
  );
}

function PlanForm({ draft, setDraft, creating }: { draft: PlanDraft; setDraft: (draft: PlanDraft) => void; creating: boolean }) {
  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) => setDraft({ ...draft, [key]: value });
  const group = "rounded-2xl border border-fg/10 bg-surface/60 p-4";
  const heading = "text-[11px] font-semibold uppercase tracking-[0.16em] text-accent";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={group}>
        <p className={heading}>Dasar</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-fg/60">Nama<input className={inputClass} placeholder="Pro" value={draft.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label className="text-sm text-fg/60">Slug<input className={inputClass} placeholder="pro" disabled={!creating} value={draft.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} /></label>
          <label className="text-sm text-fg/60">Harga normal (Rp)<input className={inputClass} type="number" min={0} placeholder="350000" value={draft.price} onChange={(e) => set("price", e.target.value)} /></label>
          <label className="text-sm text-fg/60">Interval harga<select className={inputClass} value={draft.billingInterval} onChange={(e) => set("billingInterval", e.target.value as "monthly" | "yearly")}><option value="monthly">Bulanan</option><option value="yearly">Tahunan (harga per tahun)</option></select></label>
          <label className="text-sm text-fg/60">Batas kiosk<input className={inputClass} type="number" min={0} placeholder="Kosong = tanpa batas" value={draft.kioskLimit} onChange={(e) => set("kioskLimit", e.target.value)} /></label>
          <label className="text-sm text-fg/60">Deskripsi singkat<input className={inputClass} placeholder="Untuk studio dengan beberapa booth" value={draft.description} onChange={(e) => set("description", e.target.value)} /></label>
        </div>
      </div>

      <div className={group}>
        <p className={heading}>Diskon &amp; promo</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-fg/60">Diskon promo (%)<input className={inputClass} type="number" min={0} max={90} placeholder="0" value={draft.discountPercent} onChange={(e) => set("discountPercent", e.target.value)} /></label>
          <label className="text-sm text-fg/60">Berakhir pada (opsional)<input className={inputClass} type="date" value={draft.discountEndsAt} onChange={(e) => set("discountEndsAt", e.target.value)} /></label>
          <label className="text-sm text-fg/60 sm:col-span-2">Label promo<input className={inputClass} maxLength={60} placeholder="mis. Promo peluncuran" value={draft.discountLabel} onChange={(e) => set("discountLabel", e.target.value)} /></label>
          <label className="text-sm text-fg/60 sm:col-span-2">Diskon langganan tahunan (%)<input className={inputClass} type="number" min={0} max={90} placeholder="0 = tanpa pilihan tahunan" value={draft.yearlyDiscountPercent} onChange={(e) => set("yearlyDiscountPercent", e.target.value)} disabled={draft.billingInterval === "yearly"} /></label>
        </div>
        <div className="mt-3"><PricePreview draft={draft} /></div>
      </div>

      <div className={`${group} lg:col-span-2`}>
        <p className={heading}>Fitur &amp; tampilan di website</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-fg/70"><input type="checkbox" checked={draft.screenBuilderEnabled} onChange={(e) => set("screenBuilderEnabled", e.target.checked)} /> Screen Builder</label>
          <label className="flex items-center gap-2 text-sm text-fg/70"><input type="checkbox" checked={draft.gifVideoEnabled} onChange={(e) => set("gifVideoEnabled", e.target.checked)} /> GIF &amp; Video</label>
          <label className="flex items-center gap-2 text-sm font-semibold text-accent"><input type="checkbox" checked={draft.featured} onChange={(e) => set("featured", e.target.checked)} /> Tandai “Paling populer”</label>
        </div>
        <label className="mt-3 block text-sm text-fg/60">Daftar keunggulan tambahan (satu per baris, maks 12)
          <textarea className={`${inputClass} min-h-[110px] resize-y`} placeholder={"Dukungan prioritas lewat WhatsApp\nPendampingan instalasi"} value={draft.featuresText} onChange={(e) => set("featuresText", e.target.value)} />
        </label>
      </div>
    </div>
  );
}

function PlanSummary({ plan }: { plan: Plan }) {
  const base = Number(plan.price);
  const now = Date.now();
  const promoActive = plan.discountPercent > 0 && (!plan.discountEndsAt || new Date(plan.discountEndsAt).getTime() > now);
  const promoPrice = promoActive ? Math.round((base * (1 - plan.discountPercent / 100)) / 100) * 100 : base;
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 font-display text-lg font-semibold">{plan.name}{plan.featured && <Icon name="star" className="h-4 w-4 text-amber-500" />}</p>
          <p className="text-xs text-fg/40">{plan.slug}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${plan.active ? "bg-emerald-400/15 text-emerald-600" : "bg-fg/10 text-fg/50"}`}>{plan.active ? "Aktif" : "Nonaktif"}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-accent">
        {promoActive && <span className="mr-2 text-base font-normal text-fg/35 line-through">{money(base)}</span>}
        {money(promoPrice)}
        <span className="text-sm font-normal text-fg/40">{BILLING_LABEL[plan.billingInterval]}</span>
      </p>
      {promoActive && (
        <p className="mt-1 text-xs font-semibold text-emerald-600">
          Diskon {plan.discountPercent}%{plan.discountLabel ? ` · ${plan.discountLabel}` : ""}{plan.discountEndsAt ? ` · sampai ${new Date(plan.discountEndsAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}` : ""}
        </p>
      )}
      {plan.discountPercent > 0 && !promoActive && <p className="mt-1 text-xs text-fg/40">Promo {plan.discountPercent}% sudah berakhir.</p>}
      {plan.billingInterval === "monthly" && plan.yearlyDiscountPercent > 0 && (
        <p className="mt-1 text-xs text-fg/55">Tahunan: {money(Math.round((promoPrice * 12 * (1 - plan.yearlyDiscountPercent / 100)) / 100) * 100)} (hemat {plan.yearlyDiscountPercent}%)</p>
      )}
      <p className="mt-1 text-xs text-fg/45">{plan.kioskLimit === null ? "Tanpa batas kiosk" : `Maks ${plan.kioskLimit} kiosk`}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${plan.screenBuilderEnabled ? "bg-emerald-400/15 text-emerald-600" : "bg-fg/5 text-fg/30 line-through"}`}>Screen Builder</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${plan.gifVideoEnabled ? "bg-emerald-400/15 text-emerald-600" : "bg-fg/5 text-fg/30 line-through"}`}>GIF &amp; Video</span>
      </div>
      {plan.description && <p className="mt-2 text-xs text-fg/50">{plan.description}</p>}
      {plan.features?.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-fg/55">{plan.features.map((feature) => <li key={feature} className="flex gap-1.5"><Icon name="check" className="mt-0.5 h-3 w-3 shrink-0 text-accent" />{feature}</li>)}</ul>
      )}
    </>
  );
}

export default function PlansPanel({ onPlansChanged }: { onPlansChanged?: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<PlanDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<PlanDraft>(EMPTY_DRAFT);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    superadminApi.getPlans().then((rows) => setPlans(rows ?? [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!draft.name.trim() || !draft.slug.trim()) return;
    setError("");
    try {
      await superadminApi.createPlan({ ...toPayload(draft), slug: draft.slug.trim().toLowerCase(), sortOrder: plans.length + 1 });
      setDraft(EMPTY_DRAFT);
      setCreating(false);
      load();
      onPlansChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat plan");
    }
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setError("");
    try {
      await superadminApi.updatePlan(editingId, toPayload(editingDraft));
      setEditingId(null);
      load();
      onPlansChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan perubahan plan");
    }
  };

  const toggleActive = async (plan: Plan) => {
    setError("");
    try {
      await superadminApi.updatePlan(plan.id, { active: !plan.active });
      load();
      onPlansChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status plan");
    }
  };

  const remove = async (plan: Plan) => {
    if (!window.confirm(`Hapus plan "${plan.name}"? Kalau masih dipakai tenant, plan hanya akan dinonaktifkan.`)) return;
    setError("");
    try {
      await superadminApi.deletePlan(plan.id);
      load();
      onPlansChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus plan");
    }
  };

  return (
    <section className="rounded-[2rem] border border-fg/10 bg-fg/[0.045] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[.16em] text-accent">SUBSCRIPTION PLANS</p>
          <h2 className="mt-2 font-display text-xl font-semibold">{plans.length} plan terdaftar</h2>
          <p className="mt-1 text-sm text-fg/45">Paket yang tampil di halaman harga website. Atur harga, diskon promo, dan pilihan tahunan di sini.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="rounded-lg border border-fg/15 px-3 py-2 text-xs text-fg/60">{loading ? "Memuat…" : "Muat ulang"}</button>
          <button type="button" onClick={() => { setCreating((open) => !open); setError(""); }} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold">{creating ? "Tutup" : "+ Plan baru"}</button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {creating && (
        <div className="mt-5 rounded-2xl border border-accent/25 bg-accent/[0.04] p-4">
          <PlanForm draft={draft} setDraft={setDraft} creating />
          <button type="button" onClick={create} disabled={!draft.name.trim() || !draft.slug.trim()} className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Tambah plan</button>
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <div key={plan.id} className={`rounded-2xl border p-4 ${editingId === plan.id ? "border-accent/40 bg-accent/[0.04] sm:col-span-2 lg:col-span-3" : plan.active ? "border-fg/10 bg-fg/5" : "border-fg/10 bg-fg/5 opacity-60"}`}>
            {editingId === plan.id ? (
              <div>
                <p className="mb-3 font-display text-lg font-semibold">Edit plan “{plan.name}”</p>
                <PlanForm draft={editingDraft} setDraft={setEditingDraft} creating={false} />
                <div className="mt-4 flex gap-2"><button onClick={saveEdit} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold">Simpan perubahan</button><button onClick={() => setEditingId(null)} className="rounded-xl border border-fg/15 px-5 py-2.5 text-sm">Batal</button></div>
              </div>
            ) : (
              <>
                <PlanSummary plan={plan} />
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-fg/10 pt-3">
                  <button onClick={() => { setEditingId(plan.id); setEditingDraft(draftFromPlan(plan)); setError(""); }} className="rounded-full border border-fg/15 px-3 py-1 text-xs">Edit</button>
                  <button onClick={() => toggleActive(plan)} className="rounded-full border border-fg/15 px-3 py-1 text-xs">{plan.active ? "Nonaktifkan" : "Aktifkan"}</button>
                  <button onClick={() => remove(plan)} className="text-xs text-red-500 hover:text-red-400">Hapus</button>
                </div>
              </>
            )}
          </div>
        ))}
        {!loading && plans.length === 0 && <p className="text-sm text-fg/40">Belum ada plan. Buat plan pertama dengan tombol “+ Plan baru”.</p>}
      </div>
    </section>
  );
}
