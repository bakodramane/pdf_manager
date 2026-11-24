import { PDFDocument, degrees } from "pdf-lib";
import type { FormValues, PageRef, PdfSource } from "./types";
import { AppError } from "./errors";
import { EmbedCache, drawAnnotations } from "./annotations";
import { applyFormValues, rebuildAcroForm } from "./forms";

/**
 * Rebuild a single PDF (as bytes) from an ordered list of page references.
 * Pages are copied from their source documents in order, the editor's extra
 * rotation is composed with each page's existing rotation, form values are
 * written into the fields, and annotations are drawn into their pages.
 *
 * Source pdf-lib documents are loaded once and cached for the call.
 */
export async function assemblePdf(
  pages: PageRef[],
  getSource: (id: string) => PdfSource | undefined,
  forms: FormValues = {},
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new AppError(
      "nothingToExport",
      "Nothing to export — the document has no pages.",
    );
  }

  const out = await PDFDocument.create();
  const docCache = new Map<string, PDFDocument>();
  const embeds = new EmbedCache(out);

  async function sourceDoc(sourceId: string): Promise<PDFDocument> {
    const cached = docCache.get(sourceId);
    if (cached) return cached;
    const src = getSource(sourceId);
    if (!src) throw new AppError("missingSource", "A source PDF is missing.");
    const doc = await PDFDocument.load(src.bytes);
    const values = forms[sourceId];
    if (values) await applyFormValues(doc, values);
    docCache.set(sourceId, doc);
    return doc;
  }

  // Copy runs of consecutive pages from the same source in one call, so
  // objects they share (such as a form field spanning several pages) are
  // copied once. A page repeated within a run starts a new run: each copy
  // must own its content so annotations drawn on one stay off the other.
  const runs: PageRef[][] = [];
  for (const ref of pages) {
    const run = runs[runs.length - 1];
    const fits =
      run &&
      run[0].sourceId === ref.sourceId &&
      !run.some((r) => r.pageIndex === ref.pageIndex);
    if (fits) run.push(ref);
    else runs.push([ref]);
  }

  for (const run of runs) {
    const doc = await sourceDoc(run[0].sourceId);
    const copies = await out.copyPages(doc, run.map((r) => r.pageIndex));
    for (let i = 0; i < run.length; i++) {
      const ref = run[i];
      const copied = copies[i];
      if (ref.rotation !== 0) {
        const current = copied.getRotation().angle;
        copied.setRotation(degrees((current + ref.rotation) % 360));
      }
      out.addPage(copied);
      if (ref.annotations?.length) await drawAnnotations(copied, ref.annotations, embeds);
    }
  }

  try {
    rebuildAcroForm(out, [...docCache.values()]);
  } catch {
    // Not fatal: the fields keep their appearance, they are just not fillable.
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
