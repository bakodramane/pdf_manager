/**
 * Resource limits. Everything the app does happens in memory on the user's
 * device, so a hostile or simply huge input must fail early with a clear,
 * translated message instead of freezing or crashing the window.
 *
 * Limits adapt to the device where the browser reports its memory
 * (`navigator.deviceMemory`, Chromium only, rounded and capped at 8 GB); the
 * defaults below are tuned for a 4 GB Windows machine.
 */

export interface Limits {
  /** Largest single PDF accepted. */
  maxFileBytes: number;
  /** Total bytes of all PDFs loaded at once (merges, inserts). */
  maxTotalBytes: number;
  /** Total pages across all loaded documents. */
  maxTotalPages: number;
  /** Files accepted in one drop / picker selection. */
  maxFilesPerAdd: number;
  /** Largest image accepted for annotations or image-to-PDF. */
  maxImageBytes: number;
  /** Largest decoded image (width × height). */
  maxImagePixels: number;
  /** Largest canvas rendered for a page (viewer, OCR, export to image). */
  maxRenderPixels: number;
  /** Highest resolution used to rasterise a page for OCR or image export. */
  maxRenderDpi: number;
  /** Undo steps kept in memory. */
  historySteps: number;
}

const MB = 1024 * 1024;

/** Conservative defaults (4 GB RAM class device). */
export const DEFAULT_LIMITS: Limits = {
  maxFileBytes: 200 * MB,
  maxTotalBytes: 400 * MB,
  maxTotalPages: 3000,
  maxFilesPerAdd: 50,
  maxImageBytes: 40 * MB,
  maxImagePixels: 60_000_000,
  maxRenderPixels: 16_000_000,
  maxRenderDpi: 400,
  historySteps: 50,
};

/** Limits for this device. `deviceMemoryGb` is injectable for tests. */
export function limitsFor(deviceMemoryGb?: number): Limits {
  const mem = deviceMemoryGb ?? readDeviceMemory();
  if (!mem || mem >= 4) {
    // 8 GB (the reported maximum) gets a larger total budget.
    return mem && mem >= 8 ? { ...DEFAULT_LIMITS, maxTotalBytes: 800 * MB, maxTotalPages: 6000 } : DEFAULT_LIMITS;
  }
  // 2 GB or less: halve the in-memory budgets.
  return {
    ...DEFAULT_LIMITS,
    maxFileBytes: 100 * MB,
    maxTotalBytes: 150 * MB,
    maxTotalPages: 1000,
    maxImagePixels: 30_000_000,
    maxRenderPixels: 8_000_000,
    maxRenderDpi: 300,
    historySteps: 25,
  };
}

function readDeviceMemory(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const value = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof value === "number" && value > 0 ? value : undefined;
}

export const LIMITS: Limits = limitsFor();

/** Megabytes, rounded, for messages. */
export function toMb(bytes: number): number {
  return Math.round(bytes / MB);
}

/**
 * Scale factor that keeps a `width × height` raster under `maxPixels`
 * (1 when it already fits).
 */
export function fitPixels(width: number, height: number, maxPixels: number): number {
  const px = width * height;
  if (!(px > 0) || px <= maxPixels) return 1;
  return Math.sqrt(maxPixels / px);
}
