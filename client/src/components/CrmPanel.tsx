import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type CrmCustomer, type CrmSession } from "@/lib/api";
import { panel } from "@/lib/adminUi";
import { Icon } from "@/components/kiosk/Icons";
import Spinner from "@/components/Spinner";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { pushToast } from "@/lib/toastStore";
import { DEFAULT_WA_TEMPLATE, downloadText, fillTemplate, initialsOf, prettyPhone, relativeTime, rupiah, toCsv, waHref, rupiahShort } from "@/lib/crmFormat";

// Customer database + CRM in ONE place (it used to be two menus: a bare table and a separate "CRM detail" page).
// Big, touch-friendly rows (the booth PC is often a touchscreen with the on-screen keyboard): search, filters, a one-tap
// WhatsApp button on every row, and a side drawer with the full history, notes and tags.

const PAGE = 20;
const TEMPLATE_KEY = "studiodo-crm-wa-template";
const FILTERS = [
  { id: "all", label: "Semua" },
  { id: "returning", label: "Pelanggan setia" },
  { id: "new", label: "Baru (30 hari)" },
  { id: "consent", label: "Boleh dipublikasi" },
  { id: "optout", label: "Jangan dihubungi" },
] as const;
const SORTS = [
  { id: "recent", label: "Terbaru" },
  { id: "visits", label: "Paling sering" },
  { id: "spend", label: "Belanja terbesar" },
  { id: "name", label: "Nama A–Z" },
] as const;

function readTemplate() {
  try { return localStorage.getItem(TEMPLATE_KEY) || DEFAULT_WA_TEMPLATE; } catch { return DEFAULT_WA_TEMPLATE; }
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className={`${panel} !px-4 !py-3`}>
      <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-fg/45">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tight">{value}</p>
      {detail && <p className="mt-0.5 truncate text-xs text-accent">{detail}</p>}
    </div>
  );
}

function WhatsAppButton({ customer, brand, large }: { customer: CrmCustomer; brand: string; large?: boolean }) {
  if (!customer.whatsapp) return null;
  const text = fillTemplate(readTemplate(), { nama: customer.name, brand, link: customer.lastShareUrl });
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (customer.marketingOptOut && !window.confirm("Pelanggan ini meminta tidak dihubungi. Tetap buka WhatsApp?")) e.preventDefault();
  };
  return (
    <a
      href={waHref(customer.whatsapp, text)}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#25D366] font-semibold text-[#06361a] shadow-md shadow-[#25D366]/25 transition hover:brightness-105 active:scale-[.98] ${large ? "min-h-[52px] px-6 text-base" : "min-h-[44px] px-4 text-sm"}`}
    >
      <Icon name="whatsapp" className={large ? "h-5 w-5" : "h-[18px] w-[18px]"} />WhatsApp
    </a>
  );
}

function Drawer({ customerKey, brand, onClose, onSaved }: { customerKey: string; brand: string; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<{ customer: CrmCustomer; sessions: CrmSession[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [optOut, setOptOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState(readTemplate);
  const [pickedLink, setPickedLink] = useState<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    let alive = true;
    api.getCrmCustomer(customerKey).then((r) => {
      if (!alive || !r) return;
      setData(r);
      setName(r.customer.name ?? "");
      setNotes(r.customer.notes ?? "");
      setTags(r.customer.tags);
      setOptOut(r.customer.marketingOptOut);
      setPickedLink(r.customer.lastShareUrl);
    }).catch((e) => alive && setError(e instanceof Error ? e.message : "Gagal memuat pelanggan"));
    return () => { alive = false; };
  }, [customerKey]);

  const addTag = () => {
    const t = tagDraft.trim().slice(0, 24);
    if (t && !tags.includes(t) && tags.length < 10) { setTags([...tags, t]); dirty.current = true; }
    setTagDraft("");
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.saveCrmCustomer({ key: customerKey, name, notes, tags, marketingOptOut: optOut });
      try { localStorage.setItem(TEMPLATE_KEY, template); } catch { /* storage unavailable */ }
      dirty.current = false;
      pushToast({ type: "success", title: "Data pelanggan tersimpan" });
      onSaved();
    } catch (e) {
      pushToast({ type: "error", title: "Gagal menyimpan", sub: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };
  const close = () => { if (dirty.current && !window.confirm("Ada perubahan yang belum disimpan. Tutup tanpa menyimpan?")) return; onClose(); };

  const c = data?.customer;
  const message = c ? fillTemplate(template, { nama: name || c.name, brand, link: pickedLink }) : "";
  const links = (data?.sessions ?? []).filter((s) => s.shareUrl);
  const field = "mt-1.5 w-full rounded-xl border border-fg/15 bg-surface px-3.5 py-3 text-sm outline-none transition focus:border-accent";

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <aside className="flex h-full w-full max-w-[560px] flex-col overflow-hidden border-l border-fg/10 bg-[var(--kiosk-background)] text-[var(--kiosk-text)] shadow-2xl" role="dialog" aria-label="Detail pelanggan">
        <header className="flex items-start justify-between gap-3 border-b border-fg/10 p-5">
          {c ? (
            <div className="flex min-w-0 items-center gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent/15 font-display text-xl font-semibold text-accent">{initialsOf(name || c.name, c.whatsapp ?? c.email ?? "?")}</span>
              <div className="min-w-0">
                <p className="truncate font-display text-2xl font-semibold">{name || c.name || prettyPhone(c.whatsapp) || c.email}</p>
                <p className="text-sm text-fg/50">{c.paidSessions} kunjungan · {rupiah(c.totalSpend)} · terakhir {relativeTime(c.lastSeen)}</p>
              </div>
            </div>
          ) : <p className="text-fg/50">{error ?? "Memuat…"}</p>}
          <button type="button" onClick={close} aria-label="Tutup" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-fg/15 text-fg/60 hover:border-accent hover:text-fg"><Icon name="x" className="h-5 w-5" /></button>
        </header>

        {!data ? <div className="grid flex-1 place-items-center">{error ? <p className="text-red-500">{error}</p> : <Spinner />}</div> : c && (
          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {c.whatsapp && <span className="inline-flex items-center gap-2 rounded-xl bg-fg/[0.05] px-3.5 py-2.5 text-sm font-medium"><Icon name="phone" className="h-4 w-4 text-fg/50" />{prettyPhone(c.whatsapp)}</span>}
                {c.whatsapp && <button type="button" onClick={() => { void navigator.clipboard?.writeText(`+${c.whatsapp}`); pushToast({ type: "success", title: "Nomor disalin" }); }} className="min-h-[44px] rounded-xl border border-fg/15 px-3.5 text-sm text-fg/65 hover:border-accent hover:text-fg"><Icon name="copy" className="mr-1.5 inline h-4 w-4" />Salin</button>}
                {c.email && <a href={`mailto:${c.email}`} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-fg/15 px-3.5 text-sm text-fg/65 hover:border-accent hover:text-fg"><Icon name="mail" className="h-4 w-4" />{c.email}</a>}
                {c.consent && <span className="rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-500">Boleh dipublikasi</span>}
              </div>
              {c.whatsapp ? (
                <div className="rounded-2xl border border-[#25D366]/25 bg-[#25D366]/[0.06] p-4">
                  <p className="text-sm font-semibold">Pesan WhatsApp</p>
                  <textarea value={template} onChange={(e) => { setTemplate(e.target.value); dirty.current = true; }} rows={3} className={field} aria-label="Isi pesan" />
                  <p className="mt-1.5 text-[11px] text-fg/45">Gunakan <code>{"{nama}"}</code>, <code>{"{brand}"}</code>, <code>{"{link}"}</code>. Pesan dibuka di WhatsApp — kamu tetap menekan kirim sendiri.</p>
                  {links.length > 1 && (
                    <label className="mt-2 block text-xs text-fg/55">Link galeri yang disertakan
                      <select value={pickedLink ?? ""} onChange={(e) => setPickedLink(e.target.value)} className={field}>
                        {links.map((s) => <option key={s.id} value={s.shareUrl ?? ""}>{new Date(s.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} · {s.packageName ?? "Sesi"}</option>)}
                      </select>
                    </label>
                  )}
                  <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface px-3.5 py-3 text-sm text-fg/80">{message}</p>
                  <div className="mt-3"><WhatsAppButton customer={{ ...c, name: name || c.name, lastShareUrl: pickedLink }} brand={brand} large /></div>
                </div>
              ) : <p className="rounded-xl bg-fg/[0.04] p-3 text-sm text-fg/50">Pelanggan ini hanya meninggalkan email, belum ada nomor WhatsApp.</p>}
              {optOut && <p className="rounded-xl border border-red-400/25 bg-red-400/[0.06] p-3 text-sm text-red-500">Ditandai "jangan dihubungi" — jangan kirim promo ke pelanggan ini.</p>}
            </section>

            <section className="space-y-4">
              <label className="block text-sm font-medium">Nama<input value={name} onChange={(e) => { setName(e.target.value); dirty.current = true; }} maxLength={100} placeholder="Tambahkan nama pelanggan" className={field} /></label>
              <div>
                <p className="text-sm font-medium">Label</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {tags.map((t) => <button key={t} type="button" onClick={() => { setTags(tags.filter((x) => x !== t)); dirty.current = true; }} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-accent/12 px-3.5 text-sm font-medium text-accent hover:bg-red-400/15 hover:text-red-500" title="Ketuk untuk hapus">{t}<Icon name="x" className="h-3.5 w-3.5" /></button>)}
                  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addTag(); }}>
                    <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} maxLength={24} placeholder="mis. VIP, EO, Langganan" className="min-h-[38px] w-44 rounded-full border border-fg/15 bg-surface px-3.5 text-sm outline-none focus:border-accent" />
                    <button type="submit" className="min-h-[38px] rounded-full border border-fg/15 px-3.5 text-sm text-fg/65 hover:border-accent hover:text-fg">Tambah</button>
                  </form>
                </div>
              </div>
              <label className="block text-sm font-medium">Catatan<textarea value={notes} onChange={(e) => { setNotes(e.target.value); dirty.current = true; }} rows={3} maxLength={2000} placeholder="Preferensi, acara yang pernah dipesan, dsb." className={field} /></label>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={optOut} onChange={(e) => { setOptOut(e.target.checked); dirty.current = true; }} className="h-5 w-5 accent-[var(--accent)]" />Jangan hubungi untuk promo</label>
              <button type="button" onClick={save} disabled={saving} className="min-h-[52px] w-full rounded-xl bg-accent px-6 text-base font-semibold text-white shadow-md shadow-accent/25 disabled:opacity-60">{saving ? "Menyimpan…" : "Simpan perubahan"}</button>
            </section>

            <section>
              <h3 className="font-display text-lg font-semibold">Riwayat sesi ({data.sessions.length})</h3>
              <ul className="mt-3 space-y-2">
                {data.sessions.map((s) => (
                  <li key={s.id} className="rounded-2xl border border-fg/10 p-3.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{s.packageName ?? "Sesi"} <span className="font-normal text-fg/45">· {new Date(s.createdAt).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.paymentStatus === "success" ? "bg-emerald-400/15 text-emerald-500" : "bg-fg/10 text-fg/50"}`}>{s.paymentStatus === "success" ? rupiah(s.totalAmount) : s.paymentStatus === "pending" ? "Menunggu bayar" : "Tidak dibayar"}</span>
                    </div>
                    <p className="mt-1 text-xs text-fg/45">{s.boothLabel ? `${s.boothLabel} · ` : ""}{s.photoCount} foto{s.voucherCode ? ` · voucher ${s.voucherCode}` : ""}</p>
                    {s.feedback && <p className="mt-2 rounded-lg bg-fg/[0.04] px-3 py-2 text-fg/70">“{s.feedback}”</p>}
                    {s.shareUrl && <a href={s.shareUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 text-accent hover:underline"><Icon name="image" className="h-4 w-4" />Buka galeri</a>}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function CrmPanel() {
  const brand = useBoothConfig((s) => s.config.brandName);
  const [items, setItems] = useState<CrmCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{ customers: number; withWhatsapp: number; consent: number; returning: number; new30d: number; lifetimeSpend: number } | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("recent");
  const [tag, setTag] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = window.setTimeout(() => setDebounced(query), 300); return () => window.clearTimeout(t); }, [query]);

  const params = useMemo(() => ({ q: debounced, filter, sort, tag }), [debounced, filter, sort, tag]);
  const load = useCallback(async (append = false, offset = 0) => {
    setLoading(true);
    try {
      const r = await api.getCrmCustomers({ ...params, limit: PAGE, offset });
      if (!r) return;
      setItems((cur) => (append ? [...cur, ...r.items] : r.items));
      setTotal(r.total);
      setSummary(r.summary);
      setAllTags(r.tags);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat pelanggan");
    } finally {
      setLoading(false);
    }
  }, [params]);
  useEffect(() => { void load(false, 0); }, [load]);

  // Infinite scroll inside the list panel: fetch the next page when the end marker comes into view.
  const more = items.length < total;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || loading) return;
    const io = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) void load(true, items.length); }, { root: el.closest("[data-fit-scroll]"), rootMargin: "0px 0px 240px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, loading, items.length, load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const r = await api.getCrmExport(params);
      const rows: (string | number | null)[][] = [["Nama", "WhatsApp", "Email", "Kunjungan (dibayar)", "Total sesi", "Total belanja", "Pertama datang", "Terakhir datang", "Boleh dipublikasi", "Jangan dihubungi", "Label", "Catatan", "Feedback terakhir"]];
      for (const c of r?.items ?? []) rows.push([c.name, c.whatsapp ? `+${c.whatsapp}` : "", c.email, c.paidSessions, c.sessions, c.totalSpend, c.firstSeen, c.lastSeen, c.consent ? "Ya" : "Tidak", c.marketingOptOut ? "Ya" : "Tidak", c.tags.join("; "), c.notes, c.lastFeedback]);
      downloadText(`pelanggan-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
    } catch (e) {
      pushToast({ type: "error", title: "Gagal mengekspor", sub: e instanceof Error ? e.message : undefined });
    } finally {
      setExporting(false);
    }
  };

  const chip = (active: boolean) => `min-h-[44px] rounded-full px-4 text-sm font-semibold transition ${active ? "bg-accent text-white shadow-md shadow-accent/25" : "bg-fg/[0.06] text-fg/60 hover:text-fg"}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Stat label="Pelanggan" value={String(summary?.customers ?? 0)} detail={`${summary?.new30d ?? 0} baru 30 hari terakhir`} />
        <Stat label="Punya WhatsApp" value={String(summary?.withWhatsapp ?? 0)} detail="Bisa dihubungi langsung" />
        <Stat label="Pelanggan setia" value={String(summary?.returning ?? 0)} detail="Datang 2× atau lebih" />
        <Stat label="Boleh dipublikasi" value={String(summary?.consent ?? 0)} />
        <Stat label="Total belanja" value={rupiahShort(summary?.lifetimeSpend ?? 0)} />
      </div>

      <section className={`${panel} flex min-h-0 flex-1 flex-col !p-0`}>
        <div className="flex shrink-0 flex-col gap-3 border-b border-fg/10 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[240px] flex-1">
            <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fg/35" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama, nomor WhatsApp, email, atau catatan…" className="min-h-[52px] w-full rounded-2xl border border-fg/15 bg-surface pl-12 pr-4 text-base outline-none transition focus:border-accent" />
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Urutkan" className="min-h-[52px] rounded-2xl border border-fg/15 bg-surface px-4 text-sm outline-none focus:border-accent">{SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          <button type="button" onClick={exportCsv} disabled={exporting} className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl border border-fg/15 px-5 text-sm font-medium text-fg/70 transition hover:border-accent hover:text-fg disabled:opacity-50"><Icon name="download" className="h-4 w-4" />{exporting ? "Menyiapkan…" : "Ekspor CSV"}</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={chip(filter === f.id)}>{f.label}</button>)}
          {allTags.length > 0 && <span className="mx-1 h-6 w-px bg-fg/15" />}
          {allTags.map((t) => <button key={t} type="button" onClick={() => setTag(tag === t ? "" : t)} className={chip(tag === t)}>#{t}</button>)}
        </div>
        </div>
        <div data-fit-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">

        {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-500">{error}</p>}

        {items.length === 0 && !loading ? (
          <div className="rounded-2xl border border-dashed border-fg/15 p-10 text-center text-fg/50">
            {debounced || filter !== "all" || tag ? "Tidak ada pelanggan yang cocok dengan pencarian ini." : "Belum ada pelanggan. Nomor WhatsApp atau email yang diisi pelanggan di layar hasil akan muncul di sini."}
          </div>
        ) : (
          <ul className="divide-y divide-fg/10">
            {items.map((c) => (
              <li key={c.key}>
                <div role="button" tabIndex={0} onClick={() => setOpen(c.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(c.key); } }}
                  className="-mx-2 flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl px-2 py-3.5 transition hover:bg-fg/[0.04] focus-visible:bg-fg/[0.04]">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent/15 font-display text-lg font-semibold text-accent">{initialsOf(c.name, c.whatsapp ?? c.email ?? "?")}</span>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate text-base font-semibold">{c.name || prettyPhone(c.whatsapp) || c.email}</p>
                    <p className="truncate text-sm text-fg/50">{c.name ? (prettyPhone(c.whatsapp) || c.email) : c.email && c.whatsapp ? c.email : ""}</p>
                    {(c.tags.length > 0 || c.marketingOptOut || c.consent) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {c.tags.map((t) => <span key={t} className="rounded-full bg-accent/12 px-2.5 py-0.5 text-[11px] font-medium text-accent">{t}</span>)}
                        {c.consent && <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-500">Publikasi OK</span>}
                        {c.marketingOptOut && <span className="rounded-full bg-red-400/15 px-2.5 py-0.5 text-[11px] font-medium text-red-500">Jangan dihubungi</span>}
                      </div>
                    )}
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-semibold tabular-nums">{rupiah(c.totalSpend)}</p>
                    <p className="text-xs text-fg/45">{c.paidSessions}× datang · {relativeTime(c.lastSeen)}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <WhatsAppButton customer={c} brand={brand} />
                    <span className="grid h-11 w-11 place-items-center rounded-xl text-fg/35"><Icon name="arrow-right" className="h-5 w-5" /></span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {more && <div ref={sentinel} className="h-px" aria-hidden="true" />}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-fg/10 px-4 py-3 text-sm text-fg/50">
          <span>{loading ? <span className="inline-flex items-center gap-2"><Spinner /> Memuat…</span> : `Menampilkan ${items.length} dari ${total} pelanggan`}</span>
          {items.length < total && !loading && <button type="button" onClick={() => void load(true, items.length)} className="min-h-[44px] rounded-xl border border-fg/15 px-5 font-medium text-fg/70 hover:border-accent hover:text-fg">Muat lebih banyak</button>}
        </div>
      </section>

      {open && <Drawer customerKey={open} brand={brand} onClose={() => setOpen(null)} onSaved={() => void load(false, 0)} />}
    </div>
  );
}
