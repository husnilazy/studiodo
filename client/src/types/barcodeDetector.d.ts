// Minimal ambient type for the native BarcodeDetector API — not yet in TypeScript's
// bundled lib.dom.d.ts, but supported by the Chromium version this app's Electron
// shell ships (so no npm QR-decoding dependency is needed). Shape per the W3C
// Shape Detection API spec (only the members this app actually uses).
interface DetectedBarcode {
  rawValue: string;
}

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
  static getSupportedFormats(): Promise<string[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
