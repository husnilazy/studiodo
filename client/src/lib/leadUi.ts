// Small helpers shared by the lead CRM components.
export const fieldClass = "w-full rounded-xl border border-fg/15 bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent";
export const errMessage = (err: unknown) => (err instanceof Error ? err.message : "Terjadi kesalahan");
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

/** Opens a standalone, printable page (guides) in a new tab without needing a public URL. */
export function openHtmlPage(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
