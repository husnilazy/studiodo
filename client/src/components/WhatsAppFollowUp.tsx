import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/kiosk/Icons";

// One-click WhatsApp follow-up for the Superadmin: pick a ready message (editable), then open WhatsApp with it
// prefilled. Used on tenants, tenant applications and security alerts.

export type FollowUpContext = "tenant" | "application" | "security" | "trial" | "expiring" | "creator" | "report";

export interface FollowUpVars { owner?: string | null; business?: string | null; days?: number | null }

/** wa.me wants digits in international format; people type "0859…", "+62 859…" or "62-859…". */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

const TEMPLATES: Record<FollowUpContext, { label: string; text: (v: Required<FollowUpVars>) => string }[]> = {
  application: [
    { label: "Sapa pengaju baru", text: (v) => `Halo ${v.owner}, kami dari STUDIODO. Terima kasih sudah mengajukan ${v.business}. Boleh kami tahu sedikit tentang rencana booth Anda (jumlah booth, lokasi, kapan mulai)? Dengan itu kami bisa menyiapkan akun & key trial yang pas.` },
    { label: "Info akun sudah siap", text: (v) => `Halo ${v.owner}, akun STUDIODO untuk ${v.business} sudah kami siapkan. Detail login dan key trial sudah kami kirim ke email Anda. Kalau butuh dibantu pemasangan di PC booth, balas pesan ini ya.` },
  ],
  tenant: [
    { label: "Check-in rutin", text: (v) => `Halo ${v.owner}, kami dari STUDIODO. Bagaimana pengalaman memakai STUDIODO untuk ${v.business}? Kalau ada kendala atau butuh fitur tertentu, kabari kami ya.` },
    { label: "Tawarkan bantuan setup", text: (v) => `Halo ${v.owner}, kami lihat ${v.business} belum banyak memakai STUDIODO. Mau kami bantu setup paket, frame, dan pembayaran QRIS lewat panggilan singkat?` },
  ],
  trial: [
    { label: "Trial hampir habis", text: (v) => `Halo ${v.owner}, masa trial booth ${v.business} tinggal ${v.days} hari lagi. Supaya booth tidak terkunci, Anda bisa berlangganan lewat dashboard (menu Booth & langganan). Mau kami bantu prosesnya?` },
  ],
  expiring: [
    { label: "Langganan hampir habis", text: (v) => `Halo ${v.owner}, langganan booth ${v.business} akan berakhir ${v.days} hari lagi. Perpanjang lewat dashboard (Booth & langganan) agar booth tetap berjalan. Ada 10+ booth? Ada diskon khusus — tanyakan ke kami.` },
    { label: "Booth sudah terkunci", text: (v) => `Halo ${v.owner}, booth ${v.business} saat ini terkunci karena masa aktifnya habis. Setelah diperpanjang, booth langsung aktif lagi tanpa kehilangan data. Butuh bantuan?` },
  ],
  creator: [
    { label: "Template disetujui", text: (v) => `Halo ${v.owner}, kabar baik! Template Anda di STUDIODO sudah disetujui dan terbit di marketplace. Terima kasih sudah berkarya — kalau ada template berikutnya, kami tunggu ya.` },
    { label: "Perlu revisi", text: (v) => `Halo ${v.owner}, kami sudah meninjau template Anda di STUDIODO dan ada beberapa hal yang perlu diperbaiki (detail ada di portal kreator & email). Setelah direvisi, kirim ulang dan kami tinjau secepatnya.` },
    { label: "Sapa kreator baru", text: (v) => `Halo ${v.owner}, selamat bergabung sebagai kreator STUDIODO! Panduan format frame ada di portal kreator. Kalau butuh contoh atau bantuan teknis, balas pesan ini.` },
  ],
  report: [
    { label: "Terima kasih atas laporan", text: (v) => `Halo ${v.owner}, terima kasih sudah melaporkan template "${v.business}" di marketplace STUDIODO. Laporan Anda sudah kami tindak lanjuti. Kalau ada yang masih mengganjal, balas pesan ini ya.` },
    { label: "Minta detail tambahan", text: (v) => `Halo ${v.owner}, kami sedang meninjau laporan Anda tentang template "${v.business}". Boleh dijelaskan lebih rinci atau dikirim tangkapan layarnya agar kami bisa menindaklanjuti dengan tepat?` },
  ],
  security: [
    { label: "Konfirmasi percobaan login", text: (v) => `Halo ${v.owner}, kami dari STUDIODO. Sistem kami mendeteksi beberapa kali percobaan masuk gagal ke akun ${v.business}, sehingga login dikunci sementara. Apakah itu Anda? Jika Anda lupa kata sandi, kami bisa bantu mengatur ulang.` },
    { label: "Sarankan ganti kata sandi", text: (v) => `Halo ${v.owner}, demi keamanan akun ${v.business}, kami sarankan mengganti kata sandi di dashboard (menu Akun & keamanan). Jika itu bukan Anda yang mencoba masuk, kabari kami segera.` },
  ],
};

export default function WhatsAppFollowUp({ phone, context, vars, compact = false }: { phone: string | null | undefined; context: FollowUpContext; vars: FollowUpVars; compact?: boolean }) {
  const digits = normalizePhone(phone);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const filled: Required<FollowUpVars> = { owner: vars.owner?.trim() || "Kak", business: vars.business?.trim() || "bisnis Anda", days: vars.days ?? 0 };
  const templates = TEMPLATES[context];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!digits) {
    return <span title="Nomor WhatsApp belum diisi di profil tenant" className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-fg/10 px-2.5 py-1.5 text-xs text-fg/30"><Icon name="whatsapp" className="h-3.5 w-3.5" />{compact ? "" : "Tidak ada nomor"}</span>;
  }

  return (
    <div ref={box} className="relative inline-block text-left">
      <button type="button" onClick={() => { setOpen((o) => !o); setText(templates[0].text(filled)); }} className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-2.5 py-1.5 text-xs font-semibold text-[#06361a] shadow-sm transition hover:brightness-105" aria-expanded={open}>
        <Icon name="whatsapp" className="h-3.5 w-3.5" />{compact ? "" : "WhatsApp"}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(360px,90vw)] rounded-2xl border border-fg/10 bg-surface p-4 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-fg/45">Pesan siap kirim</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button key={t.label} type="button" onClick={() => setText(t.text(filled))} className="rounded-full bg-fg/[0.07] px-3 py-1 text-xs font-medium text-fg/70 hover:bg-accent/15 hover:text-accent">{t.label}</button>
            ))}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="mt-3 w-full rounded-xl border border-fg/15 bg-fg/5 px-3 py-2 text-sm outline-none focus:border-accent" />
          <a href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}
            className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-[#06361a] hover:brightness-105">
            <Icon name="whatsapp" className="h-4 w-4" />Buka WhatsApp (+{digits})
          </a>
        </div>
      )}
    </div>
  );
}
