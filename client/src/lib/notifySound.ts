// A short two-note chime for new chat replies / alerts, generated with the Web Audio API (no audio file to ship).
// Browsers only allow sound after the person has interacted with the page once, so the audio context is unlocked on the first click or
// key press; before that the chime is silently skipped (the popup and tab title still tell them). The on/off choice is remembered.

const KEY = "studiodo-chat-sound";
let ctx: AudioContext | null = null;

export function isChatSoundOn(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}

export function setChatSound(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* the choice just is not remembered */ }
}

function audio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    return ctx;
  } catch { return null; }
}

if (typeof window !== "undefined") {
  const unlock = () => { void audio()?.resume().catch(() => undefined); };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

export function playChime() {
  if (!isChatSoundOn()) return;
  const c = audio();
  if (!c || c.state !== "running") return;
  try {
    const now = c.currentTime;
    [[880, 0], [1175, 0.16]].forEach(([freq, offset]) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.32);
      osc.connect(gain).connect(c.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.34);
    });
  } catch { /* a missing chime must never break the chat */ }
}
