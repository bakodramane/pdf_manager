import { PDFDocument } from "pdf-lib";
import type { PageRef, PdfSource } from "./types";

export const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB safety ceiling

export class PdfValidationError extends Error {}

let idCounter = 0;
/** Monotonic id generator — good enough for a single-session client app. */
export function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

function looksLikePdf(bytes: Uint8Array): boolean {
  // A PDF must begin with "%PDF-" (allowing a small leading offset, which
  // some real-world files have).
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

/**
 * Validate and load a File into a PdfSource plus its initial page references.
 * Throws PdfValidationError with a user-facing message on any problem.
 */
export async function loadPdfFile(
  file: File,
): Promise<{ source: PdfSource; pages: PageRef[] }> {
  if (!file) {
    throw new PdfValidationError("No file provided.");
  }
  const isPdfType =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
  if (!isPdfType) {
    throw new PdfValidationError(`"${file.name}" is not a PDF file.`);
  }
  if (file.size === 0) {
    throw new PdfValidationError(`"${file.name}" is empty.`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new PdfValidationError(
      `"${file.name}" is too large (max ${Math.round(
        MAX_FILE_BYTES / (1024 * 1024),
      )} MB).`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikePdf(bytes)) {
    throw new PdfValidationError(
      `"${file.name}" does not look like a valid PDF.`,
    );
  }

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/encrypt/i.test(msg)) {
      throw new PdfValidationError(
        `"${file.name}" is password-protected. Remove the password and try again.`,
      );
    }
    throw new PdfValidationError(
      `"${file.name}" could not be read — it may be corrupted.`,
    );
  }

  const pageCount = doc.getPageCount();
  if (pageCount === 0) {
    throw new PdfValidationError(`"${file.name}" has no pages.`);
  }

  const id = makeId("src");
  const source: PdfSource = { id, name: file.name, bytes, pageCount };
  const pages: PageRef[] = Array.from({ length: pageCount }, (_, i) => ({
    id: makeId("pg"),
    sourceId: id,
    pageIndex: i,
    rotation: 0,
  }));
  return { source, pages };
}
