import AdminKeyboard from "@/components/AdminKeyboard";
import { openAdminFromKiosk } from "@/lib/adminEntry";
import { useCallback, useEffect, useState } from "react";
import { useBoothConfig, syncBoothConfigFromServer } from "@/lib/boothConfigStore";
import { api } from "@/lib/api";
import { getApiBaseUrl, isKioskPaired } from "@/lib/apiConfig";
import { checkTetherBridge, type TetherBridgeHealth } from "@/lib/camera";
import { checkKioskToken, checkCamera, checkNetwork, checkPrinter, type DiagnosticResult } from "@/lib/deviceDiagnostics";
import type { StudiodoPrinterInfo, StudiodoSystemDiagnostics } from "@/types/electron";

type TabKey = "diagnostik" | "kamera" | "printer" | "sync" | "sistem" | "riwayat";

const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: "diagnostik", label: "Diagnostik", hint: "Status hardware sekilas" },
  { key: "kamera", label: "Kamera", hint: "Konfigurasi + uji kamera" },
  { key: "printer", label: "Printer", hint: "Konfigurasi + uji print" },
  { key: "sync", label: "Server & Sync", hint: "Server, token, sync" },
  { key: "sistem", label: "Sistem", hint: "Versi & perangkat" },
  { key: "riwayat", label: "Riwayat & Log", hint: "Sesi terakhir" },
];

/**
 * On-site staff console, opened from *inside* the fullscreen kiosk window via
 * Ctrl+Shift+O (see electron/main.cjs). Deliberately no visible trigger button —
 * this runs in public-facing spaces, same "secret combo" model as the existing
 * admin shortcut (Ctrl+Shift+A).
 */
export default function OperatorConsole() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("diagnostik");

  useEffect(() => {
    if (!window.studiodo?.onOperatorConsoleToggle) return;
    return window.studiodo.onOperatorConsoleToggle(() => setOpen((o) => !o));
  }, []);

  // Dev/browser fallback (no Electron IPC available under `npm run dev:client` alone).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        setOpen((o) => !o);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!open) return null;

  return (
    <div className="force-dark fixed inset-0 z-[100] flex bg-[#0b0b10] text-white">
      <AdminKeyboard />
      <aside className="flex w-72 shrink-0 flex-col border-r border-white/10 bg-black/40 p-5">
        <p className="eyebrow">OPERATOR</p>
        <h1 className="font-display text-2xl font-bold">Konsol Perangkat</h1>
        <nav className="mt-6 flex-1 space-y-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`w-full rounded-xl px-3 py-2.5 text-left transition ${tab === item.key ? "bg-accent text-white" : "text-fg/60 hover:bg-fg/5"}`}
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="block text-xs opacity-70">{item.hint}</span>
            </button>
          ))}
        </nav>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold">
          Tutup konsol
        </button>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        {tab === "diagnostik" && <DiagnosticsPanel />}
        {tab === "kamera" && <CameraPanel />}
        {tab === "printer" && <PrinterPanel />}
        {tab === "sync" && <SyncPanel />}
        {tab === "sistem" && <SystemPanel />}
        {tab === "riwayat" && <HistoryPanel />}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-fg/5 pb-3 text-sm last:border-0 last:pb-0">
      <span className="text-fg/45">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

type CheckKey = "token" | "kamera" | "jaringan" | "sync" | "printer";
const CHECK_LABELS: Record<CheckKey, string> = {
  token: "Token device",
  kamera: "Kamera",
  jaringan: "Jaringan",
  sync: "Sinkronisasi",
  printer: "Printer",
};
const STATUS_BADGE: Record<DiagnosticResult["status"], { label: string; className: string }> = {
  ok: { label: "OK", className: "border-emerald-400/30 text-emerald-300" },
  warn: { label: "Perhatian", className: "border-amber-400/30 text-amber-300" },
  fail: { label: "Gagal", className: "border-red-400/30 text-red-300" },
  checking: { label: "Memeriksa…", className: "border-fg/15 text-fg/50" },
};

function DiagnosticsPanel() {
  const config = useBoothConfig((s) => s.config);
  const [results, setResults] = useState<Partial<Record<CheckKey, DiagnosticResult>>>({});
  const [running, setRunning] = useState(false);

  const runAll = useCallback(async () => {
    setRunning(true);
    const checking: DiagnosticResult = { status: "checking", detail: "" };
    setResults({ token: checking, kamera: checking, jaringan: checking, sync: checking, printer: checking });
    const [token, kamera, jaringan, printer] = await Promise.all([
      checkKioskToken(),
      checkCamera(config.cameraMode, config.tetherBridgeUrl),
      checkNetwork(),
      checkPrinter(config.printerName),
    ]);
    setResults({
      token,
      kamera,
      jaringan,
      printer,
      sync: jaringan.status === "ok" ? { status: "ok", detail: "Konfigurasi tenant terakhir berhasil ditarik." } : { status: "warn", detail: "Belum bisa dipastikan tanpa jaringan." },
    });
    setRunning(false);
  }, [config.cameraMode, config.tetherBridgeUrl, config.printerName]);

  useEffect(() => {
    runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = (Object.keys(CHECK_LABELS) as CheckKey[]).map((key) => ({ key, label: CHECK_LABELS[key], result: results[key] }));
  const passCount = entries.filter((entry) => entry.result?.status === "ok").length;
  const scorePercent = Math.round((passCount / entries.length) * 100);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between rounded-2xl border border-fg/10 bg-fg/[0.03] p-5">
        <div>
          <p className="eyebrow">RINGKASAN KESEHATAN</p>
          <p className="font-display text-3xl font-bold">
            {scorePercent}% <span className="text-accent">sehat</span>
          </p>
          <p className="text-xs text-fg/40">{passCount}/{entries.length} cek lolos</p>
        </div>
        <button type="button" onClick={runAll} disabled={running} className="rounded-xl border border-fg/15 px-4 py-2 text-sm disabled:opacity-50">
          {running ? "Memeriksa…" : "Periksa ulang"}
        </button>
      </div>
      <div className="divide-y divide-fg/10 rounded-2xl border border-fg/10">
        {entries.map((entry) => {
          const badge = STATUS_BADGE[entry.result?.status ?? "checking"];
          return (
            <div key={entry.key} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-semibold">{entry.label}</p>
                <p className="text-xs text-fg/45">{entry.result?.detail || "Memeriksa…"}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs ${badge.className}`}>{badge.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CameraPanel() {
  const { config, update } = useBoothConfig();
  const [health, setHealth] = useState<TetherBridgeHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const check = useCallback(async () => {
    if (config.cameraMode !== "tether" || !config.tetherBridgeUrl) {
      setHealth(null);
      return;
    }
    setChecking(true);
    setHealth(await checkTetherBridge(config.tetherBridgeUrl));
    setChecking(false);
  }, [config.cameraMode, config.tetherBridgeUrl]);

  useEffect(() => {
    check();
  }, [check]);

  const restartBridge = async () => {
    if (!window.studiodo?.restartDigicamBridge) return;
    setRestarting(true);
    await window.studiodo.restartDigicamBridge();
    await check();
    setRestarting(false);
  };

  return (
    <div className="max-w-2xl space-y-5">
      <p className="eyebrow">KAMERA</p>
      <h2 className="font-display text-2xl font-bold">Konfigurasi kamera</h2>
      <div className="flex gap-2">
        {(["webcam", "tether"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => update({ cameraMode: mode })}
            className={`rounded-xl border px-4 py-2 text-sm ${config.cameraMode === mode ? "border-accent bg-accent/15 text-fg" : "border-fg/15 text-fg/60"}`}
          >
            {mode === "webcam" ? "Webcam" : "Tether (DSLR)"}
          </button>
        ))}
      </div>

      {config.cameraMode === "tether" && (
        <div className="space-y-3 rounded-2xl border border-fg/10 bg-fg/[0.03] p-5">
          <label className="block text-sm text-fg/60">
            URL bridge kamera
            <input
              className="mt-1 w-full rounded-lg border border-fg/15 bg-fg/5 px-3 py-2 text-sm outline-none focus:border-accent"
              value={config.tetherBridgeUrl}
              onChange={(event) => update({ tetherBridgeUrl: event.target.value })}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={check} disabled={checking} className="rounded-lg border border-fg/15 px-3 py-2 text-xs disabled:opacity-50">
              {checking ? "Mengecek…" : "Cek ulang"}
            </button>
            {window.studiodo?.restartDigicamBridge && (
              <button type="button" onClick={restartBridge} disabled={restarting} className="rounded-lg border border-fg/15 px-3 py-2 text-xs disabled:opacity-50">
                {restarting ? "Restart…" : "Restart bridge"}
              </button>
            )}
            {health && (
              <span className={`text-xs ${health.ok ? "text-emerald-300" : "text-red-300"}`}>
                {health.ok ? `Bridge terhubung${health.digicamReachable === false ? " (digiCamControl belum aktif)" : health.cameraConnected === false ? " (kamera tidak terdeteksi)" : ""}` : health.error}
              </span>
            )}
          </div>
        </div>
      )}
      {config.cameraMode === "webcam" && (
        <p className="text-sm text-fg/45">Mode webcam pakai kamera browser langsung — tidak butuh konfigurasi bridge.</p>
      )}
    </div>
  );
}

function PrinterPanel() {
  const { config, update } = useBoothConfig();
  const [printers, setPrinters] = useState<StudiodoPrinterInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<"idle" | "printing" | "ok" | "error">("idle");
  const [testError, setTestError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!window.studiodo?.listPrinters) return;
    const result = await window.studiodo.listPrinters();
    if (result.ok) {
      setPrinters(result.printers);
      setError(null);
    } else {
      setError(result.error ?? "Gagal membaca daftar printer");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runTestPrint = async () => {
    if (!window.studiodo?.printImage) {
      setTestStatus("error");
      setTestError("Fitur cetak hanya tersedia di aplikasi desktop STUDIODO (Electron).");
      return;
    }
    setTestStatus("printing");
    setTestError(null);
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1800;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = config.accentColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 64px sans-serif";
    ctx.fillText("TEST PRINT", canvas.width / 2, canvas.height / 2 - 30);
    ctx.font = "32px sans-serif";
    ctx.fillText("Operator Console", canvas.width / 2, canvas.height / 2 + 40);
    const result = await window.studiodo.printImage({ dataUrl: canvas.toDataURL("image/jpeg", 0.92), printerName: config.printerName, copies: 1 });
    if (result.ok) {
      setTestStatus("ok");
    } else {
      setTestStatus("error");
      setTestError(result.error ?? "Print gagal");
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <p className="eyebrow">PRINTER</p>
      <h2 className="font-display text-2xl font-bold">Konfigurasi printer</h2>
      {!window.studiodo?.listPrinters && <p className="text-sm text-fg/40">Fitur ini hanya tersedia di aplikasi desktop STUDIODO (Electron).</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}
      <select
        className="w-full rounded-lg border border-fg/15 bg-fg/5 px-3 py-2.5 text-sm outline-none focus:border-accent"
        value={config.printerName ?? ""}
        onChange={(event) => update({ printerName: event.target.value || null })}
      >
        <option value="">— pilih printer —</option>
        {printers.map((printer) => (
          <option key={printer.name} value={printer.name}>
            {printer.displayName}{printer.isDefault ? " (default)" : ""}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={refresh} className="rounded-lg border border-fg/15 px-3 py-2 text-xs">Scan ulang</button>
        <button type="button" onClick={runTestPrint} disabled={testStatus === "printing"} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold disabled:opacity-50">
          {testStatus === "printing" ? "Mencetak…" : "Test print"}
        </button>
        {testStatus === "ok" && <span className="text-xs text-emerald-300">Berhasil dikirim ke printer.</span>}
        {testStatus === "error" && <span className="text-xs text-red-300">{testError}</span>}
      </div>
    </div>
  );
}

function SyncPanel() {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const runSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await syncBoothConfigFromServer();
      setLastSync(new Date());
    } catch {
      setSyncError("Gagal menarik konfigurasi terbaru.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <p className="eyebrow">SERVER & SYNC</p>
      <h2 className="font-display text-2xl font-bold">Koneksi ke server</h2>
      <div className="space-y-3 rounded-2xl border border-fg/10 bg-fg/[0.03] p-5">
        <Row label="Status pairing" value={isKioskPaired() ? "Terhubung" : "Belum di-pairing"} />
        <Row label="Server URL" value={getApiBaseUrl()} />
        <Row label="Sync terakhir (sesi ini)" value={lastSync ? lastSync.toLocaleTimeString("id-ID") : "Belum pernah"} />
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={runSync} disabled={syncing} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold disabled:opacity-50">
          {syncing ? "Menyinkronkan…" : "Tarik konfigurasi terbaru"}
        </button>
        {syncError && <span className="text-xs text-red-300">{syncError}</span>}
      </div>
    </div>
  );
}

function SystemPanel() {
  const [version, setVersion] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<StudiodoSystemDiagnostics | null>(null);

  useEffect(() => {
    window.studiodo?.getVersion?.().then(setVersion).catch(() => undefined);
    window.studiodo?.getSystemDiagnostics?.().then(setDiagnostics).catch(() => undefined);
  }, []);

  return (
    <div className="max-w-2xl space-y-5">
      <p className="eyebrow">SISTEM</p>
      <h2 className="font-display text-2xl font-bold">Info perangkat</h2>
      {!window.studiodo && <p className="text-sm text-fg/40">Info sistem hanya tersedia di aplikasi desktop.</p>}
      <div className="space-y-3 rounded-2xl border border-fg/10 bg-fg/[0.03] p-5">
        <Row label="Versi aplikasi" value={version ?? "-"} />
        {diagnostics && (
          <>
            <Row label="Platform" value={`${diagnostics.platform} (${diagnostics.arch})`} />
            <Row label="CPU" value={`${diagnostics.cpuModel} · ${diagnostics.cpuCount} core`} />
            <Row label="Memori" value={`${diagnostics.freeMemMB} MB bebas / ${diagnostics.totalMemMB} MB total`} />
            <Row label="Uptime" value={`${Math.round(diagnostics.uptimeSeconds / 60)} menit`} />
          </>
        )}
      </div>
      <button type="button" onClick={openAdminFromKiosk} className="mr-3 rounded-lg bg-accent px-4 py-2 text-xs font-semibold">
        Buka dashboard admin
      </button>
      {window.studiodo?.relaunchKiosk && (
        <button
          type="button"
          onClick={() => window.studiodo!.relaunchKiosk()}
          className="rounded-lg border border-fg/15 px-4 py-2 text-xs hover:border-red-400 hover:text-red-300"
        >
          Restart layar kiosk
        </button>
      )}
    </div>
  );
}

function HistoryPanel() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    api.getRecentSessions().then((rows) => setSessions(rows ?? [])).catch(() => setSessions([])).finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">RIWAYAT & LOG</p>
          <h2 className="font-display text-2xl font-bold">Sesi terakhir</h2>
        </div>
        <button type="button" onClick={refresh} className="rounded-lg border border-fg/15 px-3 py-2 text-xs">{loading ? "Memuat…" : "Muat ulang"}</button>
      </div>
      <p className="text-xs text-fg/40">Buka detail sesi buat tunjukkin QR ke customer yang lupa scan, atau cetak ulang fotonya.</p>
      <div className="divide-y divide-fg/10 rounded-2xl border border-fg/10">
        {sessions.map((session) => (
          <div key={session.id} className="flex items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-semibold">{new Date(session.createdAt).toLocaleString("id-ID")}</p>
              <p className="text-xs text-fg/45">{session.paymentMethod ?? "-"} · {(session.photoUrls ?? []).length} foto</p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase ${session.paymentStatus === "success" ? "border-emerald-400/30 text-emerald-300" : "border-fg/15 text-fg/50"}`}>
              {session.paymentStatus}
            </span>
          </div>
        ))}
        {!loading && sessions.length === 0 && <p className="p-6 text-center text-sm text-fg/40">Belum ada sesi.</p>}
      </div>
    </div>
  );
}
