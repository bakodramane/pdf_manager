import { PDFDocument, degrees } from "pdf-lib";
import type { PageRef, PdfSource } from "./types";
import { AppError } from "./errors";

/**
 * Rebuild a single PDF (as bytes) from an ordered list of page references.
 * Pages are copied from their source documents in order and the editor's
 * extra rotation is composed with each page's existing rotation.
 *
 * Source pdf-lib documents are loaded once and cached for the call.
 */
export async function assemblePdf(
  pages: PageRef[],
  getSource: (id: string) => PdfSource | undefined,
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new AppError(
      "nothingToExport",
      "Nothing to export — the document has no pages.",
    );
  }

  const out = await PDFDocument.create();
  const docCache = new Map<string, PDFDocument>();

  async function sourceDoc(sourceId: string): Promise<PDFDocument> {
    const cached = docCache.get(sourceId);
    if (cached) return cached;
    const src = getSource(sourceId);
    if (!src) throw new AppError("missingSource", "A source PDF is missing.");
    const doc = await PDFDocument.load(src.bytes);
    docCache.set(sourceId, doc);
    return doc;
  }

  // Group consecutive copies from the same source for fewer copyPages calls
  // while still preserving global order.
  for (const ref of pages) {
    const doc = await sourceDoc(ref.sourceId);
    const [copied] = await out.copyPages(doc, [ref.pageIndex]);
    if (ref.rotation !== 0) {
      const current = copied.getRotation().angle;
      copied.setRotation(degrees((current + ref.rotation) % 360));
    }
    out.addPage(copied);
  }

  return out.save();
}

/** Trigger a browser download for the given bytes, fully client-side. */
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime = "application/pdf",
): void {
  // Copy into a fresh ArrayBuffer so Blob gets a clean, correctly typed buffer.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Produce a sensible output filename from a source name + suffix. */
export function deriveName(base: string, suffix: string, ext = "pdf"): string {
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return `${stem}${suffix}.${ext}`;
}
