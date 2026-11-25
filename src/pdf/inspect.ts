import { PDFDict, PDFName, PDFStream, type PDFDocument } from "pdf-lib";

/**
 * What a loaded PDF contains that the user should know about. The app never
 * runs scripts, launches files, submits forms or opens attachments — this is
 * only used to warn honestly:
 * - a digital signature becomes invalid in any file the app exports;
 * - scripts, actions and attachments may be carried over into exported files
 *   (pages are copied with their resources), so the exported file is not
 *   "sanitised".
 */
export interface PdfFindings {
  /** Signature fields with a value, or certification (DocMDP) permissions. */
  signed: boolean;
  /** Document or field JavaScript. */
  javascript: boolean;
  /** Launch / remote / form-submission / data-import actions. */
  externalActions: boolean;
  /** Embedded files or file-attachment annotations. */
  attachments: boolean;
  /** XFA form data (not rendered by the app). */
  xfa: boolean;
}

const RISKY_ACTIONS = new Set(["Launch", "GoToR", "GoToE", "SubmitForm", "ImportData", "Rendition"]);

/** Upper bound on objects inspected, so a pathological file cannot stall the UI. */
const MAX_OBJECTS = 200_000;

function nameOf(dict: PDFDict, key: string): string | undefined {
  const v = dict.get(PDFName.of(key));
  return v instanceof PDFName ? v.decodeText() : undefined;
}

export function inspectPdf(doc: PDFDocument): PdfFindings {
  const found: PdfFindings = {
    signed: false,
    javascript: false,
    externalActions: false,
    attachments: false,
    xfa: false,
  };

  const catalog = doc.catalog;
  if (catalog.get(PDFName.of("Perms"))) found.signed = true;
  const acro = catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  if (acro?.get(PDFName.of("XFA"))) found.xfa = true;
  const names = catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  if (names?.get(PDFName.of("JavaScript"))) found.javascript = true;
  if (names?.get(PDFName.of("EmbeddedFiles"))) found.attachments = true;

  let seen = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (++seen > MAX_OBJECTS) break;
    const dict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    if (!dict) continue;

    const action = nameOf(dict, "S");
    if (action === "JavaScript" || dict.get(PDFName.of("JS"))) found.javascript = true;
    if (action && RISKY_ACTIONS.has(action)) found.externalActions = true;

    const type = nameOf(dict, "Type");
    const subtype = nameOf(dict, "Subtype");
    if (type === "EmbeddedFile" || subtype === "FileAttachment" || dict.get(PDFName.of("EF"))) {
      found.attachments = true;
    }
    if (nameOf(dict, "FT") === "Sig" && dict.get(PDFName.of("V"))) found.signed = true;
    if (type === "Sig" && dict.get(PDFName.of("ByteRange"))) found.signed = true;
  }
  return found;
}

/** True when any finding deserves a warning. */
export function hasFindings(f: PdfFindings): boolean {
  return f.signed || f.javascript || f.externalActions || f.attachments || f.xfa;
}
