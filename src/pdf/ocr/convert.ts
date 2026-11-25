import type { OcrLine, OcrPage, OcrWord, PixelBox } from "./types";

/** Minimal shape of a Tesseract.js `Page` (only what we read). */
export interface TesseractPageLike {
  confidence?: number;
  blocks?:
    | {
        paragraphs?: {
          lines?: {
            bbox: PixelBox;
            baseline?: PixelBox & { has_baseline?: boolean };
            words?: { text: string; bbox: PixelBox; confidence: number }[];
          }[];
        }[];
      }[]
    | null;
}

/**
 * Convert a Tesseract.js result into our model. Empty words are dropped;
 * text is rebuilt from words so it always matches the positioned layer.
 */
export function fromTesseract(
  data: TesseractPageLike,
  meta: Pick<OcrPage, "pageIndex" | "width" | "height" | "transform">,
): OcrPage {
  const lines: OcrLine[] = [];
  const paragraphs: string[] = [];
  let confSum = 0;
  let confCount = 0;
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      const texts: string[] = [];
      for (const line of para.lines ?? []) {
        const words: OcrWord[] = [];
        for (const w of line.words ?? []) {
          const text = w.text.normalize("NFC").trim();
          if (!text) continue;
          words.push({ text, box: { ...w.bbox }, confidence: w.confidence });
          confSum += w.confidence;
          confCount += 1;
        }
        if (!words.length) continue;
        const b = line.baseline;
        lines.push({
          words,
          box: { ...line.bbox },
          baseline: b && b.has_baseline !== false && b.x1 > b.x0 ? { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 } : undefined,
        });
        texts.push(words.map((w) => w.text).join(" "));
      }
      if (texts.length) paragraphs.push(texts.join("\n"));
    }
  }
  return {
    ...meta,
    lines,
    text: paragraphs.join("\n\n"),
    confidence: confCount ? confSum / confCount : 0,
  };
}
