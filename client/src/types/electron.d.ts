export interface StudiodoPrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
}

export interface StudiodoPrintPayload {
  dataUrl: string;
  printerName?: string | null;
  copies?: number;
  /** "4r" (default, 10.2x15.2cm — photo strip) or "receipt" (7.2x12cm — cash voucher). */
  pageSize?: "4r" | "receipt";
}

export interface StudiodoDigicamBridgeStatus {
  enabled: boolean;
  port: number;
}

export interface StudiodoSystemDiagnostics {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCount: number;
  freeMemMB: number;
  totalMemMB: number;
  uptimeSeconds: number;
}

export interface StudiodoBridgeAPI {
  getVersion: () => Promise<string>;
  relaunchKiosk: () => Promise<void>;
  canonBridgeStatus: () => Promise<{ configured: boolean }>;
  digicamBridgeStatus: () => Promise<StudiodoDigicamBridgeStatus>;
  restartDigicamBridge: () => Promise<{ ok: boolean; error?: string }>;
  listPrinters: () => Promise<{ ok: boolean; printers: StudiodoPrinterInfo[]; error?: string }>;
  printImage: (payload: StudiodoPrintPayload) => Promise<{ ok: boolean; error?: string }>;
  downloadAsset: (payload: { url: string; filename: string }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  getSystemDiagnostics: () => Promise<StudiodoSystemDiagnostics>;
  onOperatorConsoleToggle: (callback: () => void) => () => void;
  logRenderer: (level: "log" | "warn" | "error", args: unknown[]) => void;
  platform: string;
}

declare global {
  interface Window {
    studiodo?: StudiodoBridgeAPI;
  }
}
