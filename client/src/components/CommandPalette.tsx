import { useEffect, useMemo, useRef, useState } from "react";
import { superadminApi, type SearchHit } from "@/lib/superadminApi";

// Ctrl+K / ⌘K anywhere in the dashboard: jump to a section, or find a tenant / lead / admin login / booth by name, email, phone or label.

export interface PaletteSection { id: string; label: string }
type Item = { key: string; group: string; title: string; subtitle?: string; run: () => void };

const ICON: Record<SearchHit["type"], string> = { tenant: "🏪", lead: "🧲", admin: "👤", booth: "🖥️" };
const GROUP: Record<SearchHit["type"], string> = { tenant: "Tenant", lead: "Calon tenant", admin: "Login admin", booth: "Booth" };

export default function CommandPalette({ sections, onSection, onTenant, onLead }: { sections: PaletteSection[]; onSection: (id: string) => void; onTenant: (id: string) => void; onLead: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v); }
      else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("studiodo-open-palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("studiodo-open-palette", onOpen); };
  }, []);
  useEffect(() => { if (open) { setQ(""); setHits([]); setActive(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => { superadminApi.search(q.trim()).then((r) => { if (live) { setHits(r?.hits ?? []); setActive(0); } }).catch(() => undefined); }, 180);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const close = () => setOpen(false);
    const nav = sections.filter((s) => !needle || s.label.toLowerCase().includes(needle)).slice(0, needle ? 6 : 8).map((s): Item => ({ key: `s-${s.id}`, group: "Buka menu", title: s.label, run: () => { onSection(s.id); close(); } }));
    const found = hits.map((h): Item => ({
      key: `${h.type}-${h.id}`, group: GROUP[h.type], title: `${ICON[h.type]}  ${h.title}`, subtitle: h.subtitle,
      run: () => { if (h.type === "lead") onLead(); else if (h.tenantId) onTenant(h.tenantId); close(); },
    }));
    return [...found, ...nav];
  }, [q, hits, sections, onSection, onTenant, onLead]);

  if (!open) return null;
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
  };
  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[1100] flex items-start justify-center bg-black/45 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)} role="dialog" aria-modal aria-label="Pencarian cepat">
      <div className="sa-select-list w-full max-w-xl overflow-hidden rounded-3xl border border-fg/10 bg-surface text-fg shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-fg/10 px-5 py-4">
          <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 opacity-50" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="9" r="6" /><path d="M14 14l4 4" /></svg>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari tenant, calon tenant, email, nomor WhatsApp, booth… atau buka menu" className="w-full bg-transparent text-base outline-none placeholder:text-fg/40" />
          <kbd className="rounded-md border border-fg/15 px-1.5 py-0.5 text-[10px] text-fg/50">Esc</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.key}>
                {header && <p className="px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fg/40">{header}</p>}
                <button type="button" onMouseEnter={() => setActive(i)} onClick={item.run} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${i === active ? "bg-accent/15" : ""}`}>
                  <span className="min-w-0 truncate font-medium">{item.title}</span>
                  {item.subtitle && <span className="min-w-0 truncate text-xs text-fg/50">{item.subtitle}</span>}
                </button>
              </div>
            );
          })}
          {items.length === 0 && <p className="px-3 py-8 text-center text-sm text-fg/45">{q.trim().length < 2 ? "Ketik minimal 2 huruf" : "Tidak ada hasil"}</p>}
        </div>
        <div className="flex items-center gap-4 border-t border-fg/10 px-5 py-2.5 text-[11px] text-fg/45"><span>↑↓ pilih</span><span>Enter buka</span><span className="ml-auto">Ctrl + K</span></div>
      </div>
    </div>
  );
}
