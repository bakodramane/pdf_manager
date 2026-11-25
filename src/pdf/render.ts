import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
// Worker bundle is resolved by Vite to a local hashed URL; runs off the main
// thread for large files.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// CMaps and standard fonts are bundled under public/pdfjs/ so PDF.js never
// makes network requests — required for the Electron offline build.
// With base: './', import.meta.env.BASE_URL is './' in production and '/' in
// dev; both correctly resolve to the public/ assets served by Vite or Electron.
const BASE = import.meta.env.BASE_URL;
const CMAP_URL = `${BASE}pdfjs/cmaps/`;
const FONT_URL = `${BASE}pdfjs/standard_fonts/`;
// JPEG 2000 / JBIG2 decoders and colour management (PDF.js 5+) are WASM
// modules, also bundled locally (scripts/copy-assets.mjs).
const WASM_URL = `${BASE}pdfjs/wasm/`;
const ICC_URL = `${BASE}pdfjs/iccs/`;

/**
 * Options applied to every PDF.js document the app opens. PDF files are
 * untrusted input: nothing here lets a document run code or reach the
 * network.
 * - No `url`: documents are always passed as bytes, never fetched.
 * - `enableXfa: false`: XFA forms (an XML/JS form language) are not rendered.
 * - PDF.js only executes embedded document JavaScript through the separate
 *   viewer "scripting" sandbox, which this app never loads.
 * - Assets (CMaps, fonts, WASM, ICC) resolve to the app's own origin.
 */
export const SAFE_DOCUMENT_OPTIONS = {
  cMapUrl: CMAP_URL,
  cMapPacked: true,
  standardFontDataUrl: FONT_URL,
  wasmUrl: WASM_URL,
  iccUrl: ICC_URL,
  enableXfa: false,
  useSystemFonts: false,
  stopAtErrors: false,
} as const;

interface CachedDoc {
  task: ReturnType<typeof pdfjs.getDocument>;
  promise: Promise<PDFDocumentProxy>;
}
const docCache = new Map<string, CachedDoc>();

/** Get (and cache) a PDF.js document for a source's bytes. */
export function getRenderDoc(
  sourceId: string,
  bytes: Uint8Array,
): Promise<PDFDocumentProxy> {
  const existing = docCache.get(sourceId);
  if (existing) return existing.promise;
  // PDF.js transfers/detaches the buffer, so pass a copy to keep source bytes
  // intact for pdf-lib.
  const copy = bytes.slice();
  const task = pdfjs.getDocument({ data: copy, ...SAFE_DOCUMENT_OPTIONS });
  docCache.set(sourceId, { task, promise: task.promise });
  return task.promise;
}

export function dropRenderDoc(sourceId: string): void {
  const t = docCache.get(sourceId);
  docCache.delete(sourceId);
  // Destroying the loading task also tears down the document and its worker
  // port, freeing decoded pages, fonts and images.
  void t?.task.destroy().catch(() => undefined);
}

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

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas.toDataURL("image/png");
}
