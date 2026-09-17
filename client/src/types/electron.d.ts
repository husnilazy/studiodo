export interface StudiodoPrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
}

export interface StudiodoPrintPayload {
  dataUrl: string;
  printerName?: string | null;
  copies?: number;
}

export interface StudiodoBridgeAPI {
  getVersion: () => Promise<string>;
  relaunchKiosk: () => Promise<void>;
  canonBridgeStatus: () => Promise<{ configured: boolean }>;
  listPrinters: () => Promise<{ ok: boolean; printers: StudiodoPrinterInfo[]; error?: string }>;
  printImage: (payload: StudiodoPrintPayload) => Promise<{ ok: boolean; error?: string }>;
  platform: string;
}

declare global {
  interface Window {
    studiodo?: StudiodoBridgeAPI;
  }
}
