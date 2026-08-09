import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import QRCode from "qrcode";
import { api } from "@/lib/api";
import { useKioskSession } from "@/lib/sessionStore";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { renderTemplate } from "@/lib/output";
import { OUTPUT_PRESETS, useTemplateLibrary } from "@/lib/templateStore";
import { useStickerLibrary } from "@/lib/stickerStore";
import VirtualKeyboard from "@/components/VirtualKeyboard";

// Renders the classic-vertical strip layout; other 5 layouts follow the same
// canvas-composite approach and slot into renderStrip() as they're built out.
async function renderStrip(photoUrls: string[], canvas: HTMLCanvasElement, accentColor: string, outputPreset: string, filter: string) {
  const preset = OUTPUT_PRESETS[outputPreset as keyof typeof OUTPUT_PRESETS] ?? OUTPUT_PRESETS["4r"];
  const PAD = Math.round(Math.min(preset.width, preset.height) * 0.035);
  const width = preset.width;
  const height = preset.height;
  const columns = 2;
  const rows = Math.max(1, Math.ceil(photoUrls.length / columns));
  const photoWidth = (width - PAD * (columns + 1)) / columns;
  const photoHeight = (height - PAD * (rows + 1)) / rows;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < photoUrls.length; i++) {
    const img = await new Promise<HTMLImageElement>((resolve) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => resolve(im);
      im.src = photoUrls[i];
    });
    const column = i % columns;
    const row = Math.floor(i / columns);
    const x = PAD + column * (photoWidth + PAD);
    const y = PAD + row * (photoHeight + PAD);
    ctx.filter = filter === "bw" ? "grayscale(1)" : filter === "warm" ? "sepia(.25) saturate(1.3)" : "none";
    const scale = Math.max(photoWidth / img.naturalWidth, photoHeight / img.naturalHeight);
    const sourceWidth = photoWidth / scale;
    const sourceHeight = photoHeight / scale;
    ctx.drawImage(img, (img.naturalWidth - sourceWidth) / 2, (img.naturalHeight - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, photoWidth, photoHeight);
    ctx.filter = "none";
  }

  ctx.fillStyle = accentColor;
  ctx.fillRect(0, height - 6, width, 6);
}

export default function Hasil() {
  const [, navigate] = useLocation();
  const { photoUrls, sessionId, selectedTemplateId, selectedTemplateData, outputPreset, filter, colorCorrection, mediaUrls, resetSession, templatePhotoMap } = useKioskSession();
  const storedTemplate = useTemplateLibrary((state) => state.templates.find((item) => item.id === selectedTemplateId));
  const template = selectedTemplateData ?? storedTemplate;
  const { photoStickers } = useKioskSession();
  const stickerList = useStickerLibrary((state) => state.stickers);
  const stickerAssets = useMemo(() => Object.fromEntries(stickerList.map((sticker) => [sticker.id, sticker.dataUrl])), [stickerList]);
  const config = useBoothConfig((s) => s.config);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [stripDataUrl, setStripDataUrl] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [keyboardField, setKeyboardField] = useState<"whatsapp" | "email" | null>(null);
  const [customerSaved, setCustomerSaved] = useState(false);

  useEffect(() => {
    if (!sessionId || photoUrls.length === 0) {
      navigate("/");
      return;
    }
    (async () => {
      const canvas = canvasRef.current!;
      if (template) {
        await renderTemplate(photoUrls, template, canvas, photoStickers, stickerAssets, filter, templatePhotoMap, colorCorrection);
      } else {
        await renderStrip(photoUrls, canvas, config.accentColor, outputPreset, filter);
      }
      setStripDataUrl(canvas.toDataURL("image/jpeg", 0.95));

      const shareUrl = `${window.location.origin}/#/share/${sessionId}`;
      const result = await api.finalizeSession(sessionId, {
        stripUrl: null, // TODO: upload strip blob to /storage and pass the real URL once storage endpoint is wired
        shareUrl,
      });
      const url = shareUrl;
      setShareUrl(url);
      if (qrCanvasRef.current) QRCode.toCanvas(qrCanvasRef.current, url, { width: 180 });
    })();
  }, [sessionId, template, outputPreset, filter, colorCorrection, photoStickers, stickerAssets, templatePhotoMap]);

  const download = () => {
    if (!stripDataUrl) return;
    const a = document.createElement("a");
    a.href = stripDataUrl;
    a.download = `${config.brandName.toLowerCase().replace(/\s+/g, "-")}-strip.jpg`;
    a.click();
  };

  const finish = () => {
    resetSession();
    navigate("/");
  };

  const saveCustomer = async () => {
    if (!sessionId || savingCustomer) return;
    setSavingCustomer(true);
    setCustomerSaved(false);
    try {
      await api.updateCustomer(sessionId, { whatsapp: whatsapp.trim() || undefined, email: email.trim() || undefined, publishConsent: consent });
      setCustomerSaved(true);
    } finally {
      setSavingCustomer(false);
    }
  };

  const printNow = () => {
    if (!stripDataUrl || printing) return;
    setPrinting(true);
    window.setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 450);
  };

  const keyboardValue = keyboardField === "whatsapp" ? whatsapp : email;
  const updateKeyboardValue = (value: string) => {
    if (keyboardField === "whatsapp") setWhatsapp(value);
    if (keyboardField === "email") setEmail(value.toLowerCase());
  };

  return (
    <div className="kinetic-page h-full overflow-y-auto px-5 py-8 sm:px-10">
      <header className="mx-auto max-w-6xl">
        <span className="eyebrow">06 / YOUR MOMENT</span>
        <h2 className="mt-2 font-display text-4xl font-bold sm:text-6xl">Hasil fotomu sudah siap.</h2>
        <p className="mt-2 text-white/50">Foto final, media, dan QR download ada di sini.</p>
      </header>

      <main className="mx-auto mt-8 grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="glass-panel flex justify-center rounded-[2rem] p-5 sm:p-8">
          <canvas ref={canvasRef} className="max-h-[68vh] max-w-full rounded-2xl border border-white/10 shadow-2xl" />
        </section>
        <aside className="space-y-5">
          <div className="glass-panel flex flex-col items-center rounded-[2rem] p-5">
          <canvas ref={qrCanvasRef} className="rounded-lg bg-white p-3" />
          <p className="max-w-[180px] text-center text-sm text-white/50">Scan untuk download foto di HP kamu</p>
          </div>
          <div className="glass-panel rounded-[2rem] p-5">
          <p className="eyebrow">KIRIM HASIL</p>
          <h3 className="mt-1 font-display text-xl font-semibold">Biodata customer</h3>
          <div className="mt-3 space-y-2">
            <input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} onFocus={() => setKeyboardField("whatsapp")} placeholder="Nomor WhatsApp" className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-3 outline-none focus:border-accent" />
            <input value={email} onChange={(event) => setEmail(event.target.value)} onFocus={() => setKeyboardField("email")} type="email" placeholder="Email (opsional)" className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-3 outline-none focus:border-accent" />
            <label className="flex gap-2 text-xs text-white/55"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> Izinkan hasil digunakan untuk galeri StudiDo</label>
            <button onClick={saveCustomer} disabled={savingCustomer} className="w-full rounded-xl border border-white/15 px-4 py-3 text-sm hover:border-accent disabled:opacity-50">{savingCustomer ? "Menyimpan..." : "Simpan biodata"}</button>
            {customerSaved && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">Biodata berhasil dikirim dan tersimpan.</p>}
          </div>
          </div>
        </aside>
      </main>

      <div className="mx-auto mt-6 flex max-w-6xl flex-wrap justify-center gap-3">
        <button onClick={printNow} disabled={printing} className="rounded-xl bg-accent px-7 py-3 font-semibold shadow-lg shadow-accent/20 disabled:opacity-60">{printing ? "Sedang mencetak..." : "Print Sekarang"}</button>
        <button onClick={download} className="rounded-xl border border-white/20 px-7 py-3 hover:border-accent">Download</button>
        <button onClick={finish} className="rounded-xl border border-white/20 px-7 py-3 hover:border-accent">Selesai</button>
      </div>

      {mediaUrls.length > 0 && (
        <section className="mx-auto mt-8 max-w-6xl rounded-[2rem] border border-white/10 bg-black/20 p-5">
          <div className="mb-4"><span className="eyebrow">MEDIA MOMENTS</span><h3 className="font-display text-2xl font-semibold">Video & GIF</h3></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mediaUrls.map((mediaUrl, index) => (
          <div key={mediaUrl} className="flex flex-col items-center gap-2">
            <video src={mediaUrl} controls playsInline className="w-full rounded-xl border border-white/10" />
            <a href={mediaUrl} download={`${config.brandName.toLowerCase().replace(/\s+/g, "-")}-clip-${index + 1}.webm`} className="text-sm text-accent">
              Download clip {index + 1}
            </a>
          </div>
          ))}
          </div>
        </section>
      )}
      {keyboardField && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setKeyboardField(null); }}>
          <div className="w-full max-w-4xl">
            <div className="mb-2 flex items-center justify-between rounded-2xl border border-white/10 bg-ink-950/95 px-4 py-3 text-sm text-white/60">
              <div><span>{keyboardField === "whatsapp" ? "Isi nomor WhatsApp" : "Isi email"}</span><p className="mt-1 max-w-[420px] truncate text-base font-semibold text-white">{keyboardValue || "Belum ada ketikan"}</p></div>
              <button onClick={() => setKeyboardField(null)} className="rounded-lg px-3 py-1 text-white/60 hover:bg-white/10 hover:text-white">Tutup</button>
            </div>
            <VirtualKeyboard value={keyboardValue} onChange={updateKeyboardValue} onClose={() => setKeyboardField(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
