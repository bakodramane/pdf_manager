import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
// Vite bundles this as a real module worker. Passing the Worker instance avoids
// PDF.js' fake-worker fallback, which can try to dynamically import from
// /node_modules at runtime and fail in the browser.
import PdfJsWorker from "pdfjs-dist/build/pdf.worker.mjs?worker";

pdfjs.GlobalWorkerOptions.workerPort = new PdfJsWorker();

const docCache = new Map<string, Promise<PDFDocumentProxy>>();

/** Get (and cache) a PDF.js document for a source's bytes. */
export function getRenderDoc(
  sourceId: string,
  bytes: Uint8Array,
): Promise<PDFDocumentProxy> {
  const existing = docCache.get(sourceId);
  if (existing) return existing;
  // PDF.js transfers/detaches the buffer it's given, so hand it a copy and
  // keep the caller's bytes intact for pdf-lib export.
  const copy = bytes.slice();
  const task = pdfjs.getDocument({ data: copy }).promise;
  docCache.set(sourceId, task);
  return task;
}

export function dropRenderDoc(sourceId: string): void {
  const t = docCache.get(sourceId);
  docCache.delete(sourceId);
  void t?.then((d) => d.destroy()).catch(() => undefined);
}

/**
 * Render a single page to a canvas and return a PNG data URL.
 * `extraRotation` is composed with the page's intrinsic rotation.
 */
export async function renderPageThumbnail(
  doc: PDFDocumentProxy,
  pageIndex: number,
  extraRotation: number,
  maxWidth = 200,
): Promise<string> {
  const page = await doc.getPage(pageIndex + 1); // PDF.js is 1-based
  const rotation = (page.rotate + extraRotation) % 360;
  const base = page.getViewport({ scale: 1, rotation });
  const scale = Math.min(maxWidth / base.width, 2);
  const viewport = page.getViewport({ scale, rotation });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a 2D canvas context.");

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/png");
}
