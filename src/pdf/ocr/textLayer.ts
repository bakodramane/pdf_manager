import {
  PDFDocument,
  TextRenderingMode,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  type PDFFont,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { OcrPage, PixelBox } from "./types";

type Matrix = [number, number, number, number, number, number];
type Pt = [number, number];

function invert([a, b, c, d, e, f]: Matrix): Matrix {
  const det = a * d - b * c;
  if (!det) throw new Error("Singular raster transform.");
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

function apply([a, b, c, d, e, f]: Matrix, [x, y]: Pt): Pt {
  return [a * x + c * y + e, b * x + d * y + f];
}

/** Font size relative to the OCR line box height (ascender to descender). */
const SIZE_OF_LINE = 0.85;
/** Lines skewed less than this are written level (see below). */
const MAX_SNAP_DEG = 10;

/**
 * Add an invisible, positioned Unicode text layer to the pages of `doc`
 * (a searchable PDF). The page content is not modified: the text is drawn
 * with rendering mode 3 ("neither fill nor stroke"), the standard way OCR
 * tools make scans selectable and searchable. Each word is scaled
 * horizontally (Tz) to span its recognised width, and runs along the
 * page's displayed reading direction, so rotated pages and crop boxes are
 * handled through the raster transform.
 *
 * `fontBytes` must be a TrueType/OpenType font covering the recognised
 * characters (Noto Sans is bundled); it is embedded as a subset.
 * Characters the font cannot encode are skipped rather than replaced.
 */
export async function addOcrTextLayer(
  doc: PDFDocument,
  pages: readonly OcrPage[],
  fontBytes: Uint8Array,
): Promise<{ words: number; skipped: number }> {
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  let words = 0;
  let skipped = 0;

  for (const ocr of pages) {
    if (!ocr.lines.length) continue;
    const page = doc.getPage(ocr.pageIndex);
    const fontKey = page.node.newFontDictionary("OcrText", font.ref);
    const toPdf = invert(ocr.transform);
    const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];

    for (const line of ocr.lines) {
      const lineHeight = Math.max(1, line.box.y1 - line.box.y0);
      const sizePx = lineHeight * SIZE_OF_LINE;
      // Slightly skewed scans: put the whole line on one level baseline
      // (its height at the line's centre). PDF text extractors only
      // understand text rotated in 90° steps and otherwise split skewed
      // lines, breaking reading order and search. Steeper text keeps its
      // real angle.
      const b = line.baseline;
      const slope = b && b.x1 > b.x0 ? (b.y1 - b.y0) / (b.x1 - b.x0) : 0;
      const level = Math.abs(slope) < Math.tan((MAX_SNAP_DEG * Math.PI) / 180);
      const centreX = (line.box.x0 + line.box.x1) / 2;
      const levelY = baselineAt(b, line.box, centreX, lineHeight);
      for (let i = 0; i < line.words.length; i++) {
        const word = line.words[i];
        const next = line.words[i + 1];
        // A trailing space (spanning the gap to the next word) keeps word
        // separation when the text is copied or searched.
        const text = next ? `${word.text} ` : word.text;
        const drawn = encodable(font, text);
        if (!drawn.trim()) {
          skipped += 1;
          continue;
        }
        if (drawn !== text) skipped += 1;
        const xEnd = next ? Math.max(word.box.x1, next.box.x0) : word.box.x1;
        const baseY0 = level ? levelY : baselineAt(b, line.box, word.box.x0, lineHeight);
        const baseY1 = level ? levelY : baselineAt(b, line.box, xEnd, lineHeight);
        const p0 = apply(toPdf, [word.box.x0, baseY0]);
        const p1 = apply(toPdf, [xEnd, baseY1]);
        const pu = apply(toPdf, [word.box.x0, baseY0 - sizePx]);
        const wx = p1[0] - p0[0];
        const wy = p1[1] - p0[1];
        const length = Math.hypot(wx, wy);
        const ux = pu[0] - p0[0];
        const uy = pu[1] - p0[1];
        const size = Math.hypot(ux, uy);
        if (length < 0.1 || size < 0.1) continue;
        const natural = font.widthOfTextAtSize(drawn, size);
        const squeeze = natural > 0 ? (100 * length) / natural : 100;
        ops.push(
          setFontAndSize(fontKey, size),
          setCharacterSqueeze(round(squeeze)),
          setTextMatrix(round(wx / length), round(wy / length), round(ux / size), round(uy / size), round(p0[0]), round(p0[1])),
          showText(font.encodeText(drawn)),
        );
        words += 1;
      }
    }
    ops.push(endText(), popGraphicsState());
    page.pushOperators(...ops);
  }
  return { words, skipped };
}

/** Baseline y (raster px) at x, from Tesseract's baseline or the box. */
function baselineAt(baseline: PixelBox | undefined, box: PixelBox, x: number, lineHeight: number): number {
  if (baseline && baseline.x1 > baseline.x0) {
    const t = (x - baseline.x0) / (baseline.x1 - baseline.x0);
    return baseline.y0 + (baseline.y1 - baseline.y0) * t;
  }
  // No baseline: assume descenders take the bottom ~20 % of the line box.
  return box.y1 - lineHeight * 0.2;
}

const charSets = new WeakMap<PDFFont, Set<number>>();

/** Keep only characters the font has glyphs for. */
function encodable(font: PDFFont, text: string): string {
  let supported = charSets.get(font);
  if (!supported) {
    supported = new Set(font.getCharacterSet());
    charSets.set(font, supported);
  }
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (ch === " " || supported.has(cp)) out += ch;
  }
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Record in the metadata that the text layer was produced by OCR. */
export function markOcrProducer(doc: PDFDocument, version: string): void {
  doc.setProducer(`PDF Manager ${version} (OCR text layer: Tesseract)`);
}
