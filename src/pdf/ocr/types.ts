/** OCR data model, independent of the engine and of React. */

export type OcrLanguage = "eng" | "fra" | "eng+fra";

/** Axis-aligned box in raster pixels (origin top-left, y down). */
export interface PixelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  box: PixelBox;
  /** Engine confidence 0–100 (an approximate signal, not calibrated accuracy). */
  confidence: number;
}

export interface OcrLine {
  words: OcrWord[];
  box: PixelBox;
  /** Baseline from (x0, y0) to (x1, y1) in raster pixels, when known. */
  baseline?: PixelBox;
}

export interface OcrPage {
  /** Zero-based page index in the document that was recognised. */
  pageIndex: number;
  /** Raster size in pixels. */
  width: number;
  height: number;
  /**
   * PDF.js viewport transform used for the raster: maps PDF user space to
   * raster pixels ([a, b, c, d, e, f]). Its inverse places text back.
   */
  transform: [number, number, number, number, number, number];
  lines: OcrLine[];
  /** Plain text, lines separated by "\n", paragraphs by a blank line. */
  text: string;
  /** Mean word confidence 0–100. */
  confidence: number;
}

/** Pages under this mean confidence are flagged as low quality in the UI. */
export const LOW_CONFIDENCE = 60;
