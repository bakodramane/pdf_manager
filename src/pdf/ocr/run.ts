import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import { SAFE_DOCUMENT_OPTIONS } from "../render";
import { LIMITS } from "../limits";
import { createOcrEngine, OcrCancelledError, type OcrProgress } from "./engine";
import { fromTesseract } from "./convert";
import { hasUsefulText } from "./detect";
import { rasterizePage } from "./rasterize";
import { addOcrTextLayer, markOcrProducer } from "./textLayer";
import type { OcrLanguage, OcrPage } from "./types";
import { loadUnicodeFont } from "../fonts";

export type OcrQuality = "fast" | "standard" | "high";

/** Raster resolution per quality preset (capped by LIMITS.maxRenderDpi). */
export const QUALITY_DPI: Record<OcrQuality, number> = { fast: 200, standard: 300, high: 400 };

export interface OcrRunOptions {
  /** Zero-based page indices to recognise, in order. */
  pages: number[];
  language: OcrLanguage;
  quality: OcrQuality;
  /** Recognise pages that already have a text layer too (may duplicate text). */
  includePagesWithText: boolean;
  signal?: AbortSignal;
  onProgress?: (info: { done: number; total: number; page: number; stage: string; detail?: OcrProgress }) => void;
}

export interface OcrRunResult {
  pages: OcrPage[];
  /** Pages skipped because they already have selectable text. */
  skippedWithText: number[];
  /** Pages that failed (the rest of the document is still processed). */
  failed: { page: number; reason: string }[];
  cancelled: boolean;
}

/**
 * Recognise text on the given pages of a PDF, one page at a time (bounded
 * memory: one raster and one worker at a time). Pages that already carry
 * real text are skipped unless asked. Failures are recorded per page so the
 * user can retry them; cancellation stops at once and is reported.
 */
export async function recognizePdf(bytes: Uint8Array, options: OcrRunOptions): Promise<OcrRunResult> {
  const result: OcrRunResult = { pages: [], skippedWithText: [], failed: [], cancelled: false };
  const { signal, onProgress } = options;
  const total = options.pages.length;
  const task = pdfjs.getDocument({ data: bytes.slice(), ...SAFE_DOCUMENT_OPTIONS });
  let engine: Awaited<ReturnType<typeof createOcrEngine>> | null = null;
  let current = 0;
  try {
    const doc = await task.promise;
    const dpi = Math.min(QUALITY_DPI[options.quality], LIMITS.maxRenderDpi);
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new OcrCancelledError();
      const index = options.pages[i];
      current = index + 1;
      onProgress?.({ done: i, total, page: current, stage: "render" });
      const page = await doc.getPage(index + 1);
      try {
        if (!options.includePagesWithText) {
          const content = await page.getTextContent();
          if (hasUsefulText(content.items as { str?: string }[])) {
            result.skippedWithText.push(index);
            continue;
          }
        }
        const raster = await rasterizePage(
          page,
          dpi,
          LIMITS.maxRenderPixels,
          (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }),
          signal,
        );
        try {
          engine ??= await createOcrEngine(options.language, (detail) =>
            onProgress?.({ done: i, total, page: current, stage: "recognise", detail }),
          );
          const data = await engine.recognize(raster.canvas, signal);
          result.pages.push(
            fromTesseract(data, {
              pageIndex: index,
              width: raster.canvas.width,
              height: raster.canvas.height,
              transform: raster.transform,
            }),
          );
        } finally {
          // Free the raster's pixel memory now rather than at GC time.
          raster.canvas.width = 0;
          raster.canvas.height = 0;
        }
      } catch (err) {
        if (err instanceof OcrCancelledError || signal?.aborted) throw err;
        result.failed.push({ page: index, reason: err instanceof Error ? err.name : "Error" });
        // A failed page may have killed the worker: start a fresh one next.
        await engine?.terminate();
        engine = null;
      } finally {
        page.cleanup();
      }
    }
    onProgress?.({ done: total, total, page: current, stage: "done" });
  } catch (err) {
    if (err instanceof OcrCancelledError || signal?.aborted) result.cancelled = true;
    else throw err;
  } finally {
    await engine?.terminate();
    await task.destroy().catch(() => undefined);
  }
  return result;
}

/** The bundled Unicode font (same origin), fetched once. */
export function loadTextFont(): Promise<Uint8Array> {
  return loadUnicodeFont("regular");
}

/** Build a new searchable PDF: the original pages plus an invisible OCR text layer. */
export async function makeSearchablePdf(bytes: Uint8Array, pages: OcrPage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  await addOcrTextLayer(doc, pages, await loadTextFont());
  markOcrProducer(doc, __APP_VERSION__);
  return doc.save();
}

/** Recognised text as UTF-8 (with BOM for older Windows editors), one section per page. */
export function ocrTextFile(pages: OcrPage[], pageLabel: (n: number) => string): Uint8Array {
  const body = pages
    .map((p) => `${pageLabel(p.pageIndex + 1)}\n\n${p.text}`.trimEnd())
    .join("\n\n\f\n");
  return new TextEncoder().encode(`\ufeff${body.replace(/\n/g, "\r\n")}\r\n`);
}
