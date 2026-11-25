import { PDFDocument } from "pdf-lib";
import type { PageRef, PdfSource } from "./types";
import { AppError, type ErrorCode } from "./errors";
import { LIMITS, toMb, type Limits } from "./limits";
import { inspectPdf } from "./inspect";

/** Largest single file accepted (see limits.ts for all limits). */
export const MAX_FILE_BYTES = LIMITS.maxFileBytes;

/** What is already loaded, for the total-size and page-count budgets. */
export interface LoadBudget {
  loadedBytes: number;
  loadedPages: number;
}

export class PdfValidationError extends AppError {
  constructor(
    code: ErrorCode,
    message: string,
    params: Record<string, string | number> = {},
  ) {
    super(code, message, params);
    this.name = "PdfValidationError";
  }
}

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
  budget: LoadBudget = { loadedBytes: 0, loadedPages: 0 },
  limits: Limits = LIMITS,
): Promise<{ source: PdfSource; pages: PageRef[] }> {
  if (!file) {
    throw new PdfValidationError("noFile", "No file provided.");
  }
  const isPdfType =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
  if (!isPdfType) {
    throw new PdfValidationError("notPdf", `"${file.name}" is not a PDF file.`, { name: file.name });
  }
  if (file.size === 0) {
    throw new PdfValidationError("empty", `"${file.name}" is empty.`, { name: file.name });
  }
  if (file.size > limits.maxFileBytes) {
    const max = toMb(limits.maxFileBytes);
    throw new PdfValidationError(
      "tooLarge",
      `"${file.name}" is too large (max ${max} MB).`,
      { name: file.name, max },
    );
  }
  if (budget.loadedBytes + file.size > limits.maxTotalBytes) {
    const max = toMb(limits.maxTotalBytes);
    throw new PdfValidationError(
      "totalTooLarge",
      `Opening "${file.name}" would exceed the ${max} MB in-memory budget.`,
      { name: file.name, max },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikePdf(bytes)) {
    throw new PdfValidationError(
      "invalid",
      `"${file.name}" does not look like a valid PDF.`,
      { name: file.name },
    );
  }

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/encrypt/i.test(msg)) {
      // pdf-lib cannot decrypt, and the app never bypasses encryption.
      throw new PdfValidationError(
        "encrypted",
        `"${file.name}" is encrypted (password-protected). Editing encrypted PDFs is not supported.`,
        { name: file.name },
      );
    }
    throw new PdfValidationError(
      "corrupted",
      `"${file.name}" could not be read — it may be corrupted.`,
      { name: file.name },
    );
  }

  const pageCount = doc.getPageCount();
  if (pageCount === 0) {
    throw new PdfValidationError("noPages", `"${file.name}" has no pages.`, { name: file.name });
  }

  if (budget.loadedPages + pageCount > limits.maxTotalPages) {
    throw new PdfValidationError(
      "tooManyPages",
      `Opening "${file.name}" would exceed ${limits.maxTotalPages} pages in total.`,
      { name: file.name, max: limits.maxTotalPages },
    );
  }

  let findings: PdfSource["findings"];
  try {
    findings = inspectPdf(doc);
  } catch {
    findings = undefined;
  }

  const id = makeId("src");
  const source: PdfSource = { id, name: file.name, bytes, pageCount, findings };
  const pages: PageRef[] = Array.from({ length: pageCount }, (_, i) => ({
    id: makeId("pg"),
    sourceId: id,
    pageIndex: i,
    rotation: 0,
  }));
  return { source, pages };
}
