import { api } from "@/lib/api";

// Client side of the passwordless login: start a handoff, send the person to a browser (Google) or their inbox (email link),
// then poll until they approve it. Works the same inside the desktop app and a plain browser tab.

export type HandoffOutcome = { ok: true; token: string } | { ok: false; error: string };
export type HandoffHandle = { cancel: () => void; done: Promise<HandoffOutcome> };

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => { const t = setTimeout(resolve, ms); signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true }); });

function waitForApproval(id: string, poll: string, expiresInSeconds: number, onVerified?: () => void): HandoffHandle {
  const abort = new AbortController();
  const done = (async (): Promise<HandoffOutcome> => {
    const deadline = Date.now() + expiresInSeconds * 1000;
    let notified = false;
    while (!abort.signal.aborted && Date.now() < deadline) {
      await sleep(1800, abort.signal);
      if (abort.signal.aborted) break;
      try {
        const r = await api.pollHandoff(id, poll);
        if (r?.status === "approved" && r.token) return { ok: true, token: r.token };
        if (r?.status === "failed") return { ok: false, error: r.error ?? "Gagal masuk." };
        if (r?.status === "expired" || r?.status === "invalid") return { ok: false, error: "Permintaan masuk sudah kedaluwarsa. Coba lagi." };
        if (r?.status === "verified" && !notified) { notified = true; onVerified?.(); }
      } catch { /* a network blip: keep polling until the deadline */ }
    }
    return { ok: false, error: abort.signal.aborted ? "Dibatalkan." : "Waktu habis. Coba lagi." };
  })();
  return { cancel: () => abort.abort(), done };
}

export async function signInWithGoogle(onVerified?: () => void): Promise<HandoffHandle> {
  const start = await api.startGoogleHandoff();
  if (!start) throw new Error("Tidak bisa memulai login Google.");
  window.open(start.url, "_blank", "noopener");
  return waitForApproval(start.id, start.poll, start.expiresInSeconds, onVerified);
}

export async function signInWithEmailLink(email: string, onVerified?: () => void): Promise<HandoffHandle> {
  const start = await api.startMagicHandoff(email);
  if (!start) throw new Error("Tidak bisa mengirim tautan masuk.");
  return waitForApproval(start.id, start.poll, start.expiresInSeconds, onVerified);
}
