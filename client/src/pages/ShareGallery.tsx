import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";

export default function ShareGallery({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const [session, setSession] = useState<any>(null);
  const [form, setForm] = useState({ whatsapp: "", email: "", publishConsent: false, feedback: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.getPublicSession(id).then(setSession).catch(() => setSession(false)); }, [id]);
  if (session === false) return <div className="p-10 text-center">Hasil tidak ditemukan.</div>;
  if (!session) return <div className="p-10 text-center">Memuat hasil foto...</div>;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await api.updateCustomer(id, form);
    setSaved(true);
  };
  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 overflow-y-auto px-6 py-10">
      <div><p className="text-sm uppercase tracking-[.2em] text-accent">STUDIODO Gallery</p><h1 className="mt-2 font-display text-4xl font-bold">Foto kamu sudah siap</h1></div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {(session.photoUrls ?? []).filter(Boolean).map((url: string) => <img key={url} src={url} className="w-full rounded-2xl border border-white/10 object-cover shadow-xl" />)}
      </div>
      <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 md:grid-cols-2">
        <h2 className="font-display text-xl md:col-span-2">Kirim dan beri feedback</h2>
        <input className="rounded-xl border border-white/15 bg-black/20 px-4 py-3" placeholder="Nomor WhatsApp" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        <input className="rounded-xl border border-white/15 bg-black/20 px-4 py-3" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <textarea className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 md:col-span-2" placeholder="Feedback (opsional)" value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} />
        <label className="flex gap-2 text-sm text-white/70 md:col-span-2"><input type="checkbox" checked={form.publishConsent} onChange={(e) => setForm({ ...form, publishConsent: e.target.checked })} /> Saya mengizinkan foto dipublikasikan untuk portfolio/promosi.</label>
        <button className="rounded-xl bg-accent px-5 py-3 font-semibold md:col-span-2">{saved ? "Tersimpan" : "Simpan pilihan"}</button>
      </form>
      <button onClick={() => navigate("/")} className="text-sm text-white/50">Kembali</button>
    </div>
  );
}
