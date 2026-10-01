import { useEffect, useState } from "react";
import { superadminApi, BLOG_CATEGORIES, type BlogPost, type BlogPostSummary } from "@/lib/superadminApi";
import { ImageField } from "@/components/SiteContentPanel";

// Superadmin blog manager: a list of posts and a Markdown editor. The public site renders
// the body with its own restricted Markdown renderer, so only basic formatting is supported.

const inputClass = "mt-1 w-full rounded-lg border border-fg/15 bg-fg/5 px-3 py-2 text-sm outline-none focus:border-accent";
const EMPTY: Omit<BlogPost, "id" | "createdAt" | "updatedAt" | "publishedAt"> = { slug: "", title: "", excerpt: "", body: "", author: "", category: "Informasi", coverUrl: null, position: null, status: "draft" };

const slugify = (value: string) =>
  value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—");

function Editor({ postId, onClose }: { postId: string | "new"; onClose: (changed: boolean) => void }) {
  const [draft, setDraft] = useState<typeof EMPTY | null>(postId === "new" ? EMPTY : null);
  const [slugTouched, setSlugTouched] = useState(postId !== "new");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (postId === "new") return;
    superadminApi.getBlogPost(postId)
      .then((p) => { if (p) setDraft({ slug: p.slug, title: p.title, excerpt: p.excerpt, body: p.body, author: p.author ?? "", category: p.category, coverUrl: p.coverUrl, position: p.position, status: p.status }); })
      .catch((e) => setMessage(e instanceof Error ? e.message : "Gagal memuat artikel"));
  }, [postId]);

  if (!draft) return <p className="text-sm text-fg/50">{message || "Memuat…"}</p>;

  const set = (patch: Partial<typeof EMPTY>) => setDraft({ ...draft, ...patch });
  const save = async (status: "draft" | "published") => {
    setBusy(true);
    setMessage("");
    try {
      const body = { ...draft, status };
      if (postId === "new") await superadminApi.createBlogPost(body);
      else await superadminApi.updateBlogPost(postId, body);
      onClose(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal menyimpan");
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <label className="text-sm text-fg/60">
        Judul
        <input maxLength={150} className={inputClass} value={draft.title} onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-fg/60">
          Slug (alamat artikel)
          <input maxLength={80} className={inputClass} value={draft.slug} onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value }); }} />
          <span className="mt-1 block text-xs text-fg/35">/blog/{draft.slug || "…"}</span>
        </label>
        <label className="text-sm text-fg/60">
          Penulis (opsional)
          <input maxLength={80} className={inputClass} value={draft.author ?? ""} onChange={(e) => set({ author: e.target.value })} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-fg/60">
          Kategori
          <select className={inputClass} value={draft.category} onChange={(e) => set({ category: e.target.value })}>
            {BLOG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-sm text-fg/60">
          Urutan panduan (opsional)
          <input type="number" min={0} max={999} className={inputClass} value={draft.position ?? ""} onChange={(e) => set({ position: e.target.value === "" ? null : Number(e.target.value) })} placeholder="mis. 1, 2, 3…" />
          <span className="mt-1 block text-xs text-fg/35">Dipakai di halaman Bantuan; angka kecil tampil lebih dulu.</span>
        </label>
      </div>
      <ImageField label="Gambar cover (opsional)" hint="Tanpa cover, website memakai tampilan gradien sesuai kategori. PNG/JPG/WebP, maks. 600 KB." value={draft.coverUrl ?? ""} onChange={(next) => set({ coverUrl: next || null })} />
      <label className="text-sm text-fg/60">
        Ringkasan (tampil di daftar dan hasil pencarian)
        <textarea rows={2} maxLength={300} className={inputClass} value={draft.excerpt} onChange={(e) => set({ excerpt: e.target.value })} />
      </label>
      <label className="text-sm text-fg/60">
        Isi artikel (Markdown)
        <textarea rows={16} maxLength={50000} className={`${inputClass} font-mono`} value={draft.body} onChange={(e) => set({ body: e.target.value })} />
        <span className="mt-1 block text-xs text-fg/35">Didukung: # Judul, ## Subjudul, **tebal**, *miring*, [teks](https://…), daftar “- item” / “1. item”, &gt; kutipan, `kode`. HTML mentah tidak ditampilkan.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => save("published")} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
          {draft.status === "published" ? "Simpan (tetap terbit)" : "Terbitkan"}
        </button>
        <button type="button" disabled={busy} onClick={() => save("draft")} className="rounded-xl bg-fg/10 px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
          {draft.status === "published" ? "Tarik ke draf" : "Simpan draf"}
        </button>
        <button type="button" disabled={busy} onClick={() => onClose(false)} className="rounded-xl px-4 py-2.5 text-sm text-fg/50 hover:bg-fg/10">Batal</button>
        {message && <span role="alert" className="text-sm text-red-300">{message}</span>}
      </div>
    </div>
  );
}

export function BlogPanel() {
  const [posts, setPosts] = useState<BlogPostSummary[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const load = () => {
    superadminApi.getBlogPosts().then((rows) => { setPosts(rows ?? []); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat artikel"));
  };
  useEffect(load, []);

  const remove = async (p: BlogPostSummary) => {
    if (!window.confirm(`Hapus artikel "${p.title}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    try { await superadminApi.deleteBlogPost(p.id); load(); } catch (e) { setError(e instanceof Error ? e.message : "Gagal menghapus"); }
  };

  return (
    <section className="rounded-[2rem] border border-fg/10 bg-fg/[0.045] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[.16em] text-accent">BLOG</p>
          <h2 className="mt-2 font-display text-xl font-semibold">Artikel website</h2>
          <p className="mt-1 text-sm text-fg/45">Tulis artikel untuk halaman /blog. Draf tidak terlihat publik; artikel terbit tampil dalam ±1 menit.</p>
        </div>
        {editing === null && <button type="button" onClick={() => setEditing("new")} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold">+ Artikel baru</button>}
      </div>

      {error && <p role="alert" className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

      <div className="mt-5">
        {editing !== null ? (
          <Editor postId={editing} onClose={(changed) => { setEditing(null); if (changed) load(); }} />
        ) : posts === null ? (
          <p role="status" className="text-sm text-fg/50">Memuat artikel…</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-fg/45">Belum ada artikel. Klik “Artikel baru” untuk mulai menulis.</p>
        ) : (
          <div className="grid gap-3">
            {posts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-fg/10 bg-fg/[0.03] p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{p.title}</div>
                  <div className="text-xs text-fg/40">{p.category}{p.position !== null ? ` #${p.position}` : ""} · /blog/{p.slug} · {p.status === "published" ? `terbit ${formatDate(p.publishedAt)}` : `diubah ${formatDate(p.updatedAt)}`}</div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${p.status === "published" ? "bg-emerald-500/20 text-emerald-200" : "bg-fg/10 text-fg/50"}`}>{p.status === "published" ? "Terbit" : "Draf"}</span>
                <button type="button" onClick={() => setEditing(p.id)} className="rounded-xl bg-fg/10 px-4 py-2 text-sm font-semibold hover:bg-fg/15">Edit</button>
                <button type="button" onClick={() => remove(p)} className="rounded-xl px-3 py-2 text-sm text-red-300 hover:bg-red-500/15">Hapus</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
