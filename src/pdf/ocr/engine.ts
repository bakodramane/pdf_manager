import type { TesseractPageLike } from "./convert";
import type { OcrLanguage } from "./types";

/**
 * Browser OCR engine: Tesseract.js running in a dedicated Web Worker with
 * the bundled LSTM-only WebAssembly core and language models (public/ocr/,
 * copied and digest-checked by scripts/copy-assets.mjs). Every URL points
 * at the app's own origin: nothing is fetched from a CDN, and the app's
 * CSP and (desktop) network filter would block it anyway. Models are not
 * cached in IndexedDB (`cacheMethod: "none"`); the web edition's service
 * worker caches them only after the user explicitly prepares offline use.
 */

export interface OcrProgress {
  status: string;
  progress: number;
}

export interface OcrEngine {
  recognize(image: HTMLCanvasElement | Blob, signal?: AbortSignal): Promise<TesseractPageLike>;
  terminate(): Promise<void>;
}

/** Per-page time limit (a stuck page must never hang the app). */
export const PAGE_TIMEOUT_MS = 180_000;

export class OcrCancelledError extends Error {
  constructor() {
    super("OCR cancelled.");
    this.name = "OcrCancelledError";
  }
}

export class OcrTimeoutError extends Error {
  constructor() {
    super("OCR timed out on this page.");
    this.name = "OcrTimeoutError";
  }
}

/** Absolute URL of a bundled OCR asset (workers resolve relative URLs against themselves). */
export function ocrAssetUrl(path: string): string {
  return new URL(`ocr/${path}`, document.baseURI).href;
}

export async function createOcrEngine(
  language: OcrLanguage,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrEngine> {
  // Loaded on demand: the engine is only downloaded/parsed when used.
  const { createWorker, OEM } = await import("tesseract.js");
  const worker = await createWorker(language.split("+"), OEM.LSTM_ONLY, {
    workerPath: ocrAssetUrl("worker.min.js"),
    corePath: ocrAssetUrl("core/"),
    langPath: ocrAssetUrl("lang"),
    workerBlobURL: false,
    cacheMethod: "none",
    gzip: true,
    logger: (m: { status: string; progress: number }) => onProgress?.({ status: m.status, progress: m.progress }),
    errorHandler: () => undefined,
  });
  let terminated = false;

  const terminate = async () => {
    if (terminated) return;
    terminated = true;
    await worker.terminate().catch(() => undefined);
  };

  return {
    async recognize(image, signal) {
      if (terminated) throw new OcrCancelledError();
      if (signal?.aborted) throw new OcrCancelledError();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;
      const stop = new Promise<never>((_, reject) => {
        onAbort = () => {
          // Terminating the worker is the only way to stop a running page.
          void terminate();
          reject(new OcrCancelledError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => {
          void terminate();
          reject(new OcrTimeoutError());
        }, PAGE_TIMEOUT_MS);
      });
      try {
        const result = await Promise.race([
          worker.recognize(image, {}, { blocks: true, text: true }),
          stop,
        ]);
        return result.data as unknown as TesseractPageLike;
      } finally {
        clearTimeout(timer);
        if (onAbort) signal?.removeEventListener("abort", onAbort);
      }
    },
    terminate,
  };
}
