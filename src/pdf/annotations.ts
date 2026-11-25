import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Annotation, FontFamily, ImageAnnotation, TextAnnotation } from "./types";
import { AppError } from "./errors";
import { loadUnicodeFont, styleOf, type UnicodeFontStyle } from "./fonts";

/**
 * Editable annotations are drawn into the page when the document is
 * assembled. See `AnnotationBase` (types.ts) for the coordinate frame.
 */

/** Line height used on screen and in the PDF, as a multiple of the font size. */
export const LINE_HEIGHT = 1.2;

/**
 * Distance from the top of a text box to the first baseline, as a multiple of
 * the font size, for the screen fonts that stand in for the PDF standard
 * fonts (Arial ≈ Helvetica, Times New Roman ≈ Times, Courier New ≈ Courier)
 * at LINE_HEIGHT. Derived from each font's ascent and descent:
 * (LINE_HEIGHT − (ascent + descent)) / 2 + ascent.
 */
export const BASELINE: Record<FontFamily, number> = {
  helvetica: 0.947,
  times: 0.937,
  courier: 0.867,
};

/** CSS font stacks that match the PDF standard fonts' metrics. */
export const CSS_FONT: Record<FontFamily, string> = {
  helvetica: 'Arial, "Liberation Sans", Helvetica, sans-serif',
  times: '"Times New Roman", "Liberation Serif", Times, serif',
  courier: '"Courier New", "Liberation Mono", Courier, monospace',
};

export function standardFont(font: FontFamily, bold: boolean, italic: boolean): StandardFonts {
  const table: Record<FontFamily, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
    helvetica: [
      StandardFonts.Helvetica,
      StandardFonts.HelveticaBold,
      StandardFonts.HelveticaOblique,
      StandardFonts.HelveticaBoldOblique,
    ],
    times: [
      StandardFonts.TimesRoman,
      StandardFonts.TimesRomanBold,
      StandardFonts.TimesRomanItalic,
      StandardFonts.TimesRomanBoldItalic,
    ],
    courier: [
      StandardFonts.Courier,
      StandardFonts.CourierBold,
      StandardFonts.CourierOblique,
      StandardFonts.CourierBoldOblique,
    ],
  };
  return table[font][(bold ? 1 : 0) + (italic ? 2 : 0)];
}

/** Rotate a vector clockwise by `deg` in a y-down frame (as CSS does). */
export function rotateVec(x: number, y: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
}

export interface Box {
  /** Crop box origin and size, in PDF user space. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * PDF user-space point where a local point (u, v) of an annotation lands.
 * (u, v) is measured in the annotation's own frame: from its top-left
 * corner, y down, before its rotation.
 */
export function toPdfPoint(
  box: Box,
  a: { x: number; y: number; angle: number },
  u: number,
  v: number,
): { x: number; y: number } {
  const [dx, dy] = rotateVec(u, v, a.angle);
  return { x: box.x + a.x + dx, y: box.y + box.height - (a.y + dy) };
}

/** "#rrggbb" → pdf-lib colour (black on bad input). */
export function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Normalise line breaks and tabs, and compose accents (NFC). */
export function normaliseAnnotationText(text: string): string {
  return text.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
}

const charSets = new WeakMap<PDFFont, Set<number>>();
function charSet(font: PDFFont): Set<number> {
  let set = charSets.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    charSets.set(font, set);
  }
  return set;
}

/** Characters of `text` (other than line breaks) that `font` cannot encode. */
export function unsupportedChars(font: PDFFont, text: string): string[] {
  const set = charSet(font);
  const missing = new Set<string>();
  for (const ch of text) {
    if (ch !== "\n" && !set.has(ch.codePointAt(0)!)) missing.add(ch);
  }
  return [...missing];
}

/** Caches fonts and images embedded in one output document. */
export class EmbedCache {
  private fonts = new Map<StandardFonts, Promise<PDFFont>>();
  private unicodeFonts = new Map<UnicodeFontStyle, Promise<PDFFont>>();
  private images = new Map<Uint8Array, Promise<PDFImage>>();

  constructor(private doc: PDFDocument) {}

  font(name: StandardFonts): Promise<PDFFont> {
    let f = this.fonts.get(name);
    if (!f) {
      f = this.doc.embedFont(name);
      this.fonts.set(name, f);
    }
    return f;
  }

  /**
   * Noto Sans in the given style, embedded in full: pdf-lib's subsetter
   * corrupts this font's glyph outlines (text still extracts, but renders
   * wrongly), so correctness wins over size. Only loaded when a text
   * annotation needs characters outside the standard fonts.
   */
  unicodeFont(style: UnicodeFontStyle): Promise<PDFFont> {
    let f = this.unicodeFonts.get(style);
    if (!f) {
      this.doc.registerFontkit(fontkit);
      f = loadUnicodeFont(style).then((bytes) => this.doc.embedFont(bytes, { subset: false }));
      this.unicodeFonts.set(style, f);
    }
    return f;
  }

  image(a: ImageAnnotation): Promise<PDFImage> {
    let img = this.images.get(a.bytes);
    if (!img) {
      img = a.mime === "image/png" ? this.doc.embedPng(a.bytes) : this.doc.embedJpg(a.bytes);
      this.images.set(a.bytes, img);
    }
    return img;
  }
}

function cropBox(page: PDFPage): Box {
  const { x, y, width, height } = page.getCropBox();
  return { x, y, width, height };
}

/** Baseline offset of Noto Sans at LINE_HEIGHT (ascent 1.069, descent 0.293). */
const UNICODE_BASELINE = 0.988;

async function drawText(page: PDFPage, a: TextAnnotation, cache: EmbedCache) {
  const text = normaliseAnnotationText(a.text);
  if (!text.trim()) return;
  // The standard fonts cover English and French (WinAnsi, incl. œ, €, « »).
  // Anything else switches this annotation to the embedded Unicode font;
  // characters no bundled font has are reported, never replaced.
  let font = await cache.font(standardFont(a.font, a.bold, a.italic));
  let baseline = BASELINE[a.font];
  if (unsupportedChars(font, text).length) {
    font = await cache.unicodeFont(styleOf(a.bold, a.italic));
    baseline = UNICODE_BASELINE;
    const missing = unsupportedChars(font, text);
    if (missing.length) {
      throw new AppError("unsupportedChars", `Unsupported characters: ${missing.join(" ")}`, {
        chars: missing.slice(0, 12).join(" "),
      });
    }
  }
  const origin = toPdfPoint(cropBox(page), a, 0, baseline * a.size);
  page.drawText(text, {
    x: origin.x,
    y: origin.y,
    size: a.size,
    font,
    color: hexToRgb(a.color),
    lineHeight: a.size * LINE_HEIGHT,
    // PDF angles turn counter-clockwise; ours turn clockwise.
    rotate: degrees(-a.angle),
  });
}

async function drawImage(page: PDFPage, a: ImageAnnotation, cache: EmbedCache) {
  const image = await cache.image(a);
  // pdf-lib anchors images at their bottom-left corner.
  const origin = toPdfPoint(cropBox(page), a, 0, a.height);
  page.drawImage(image, {
    x: origin.x,
    y: origin.y,
    width: a.width,
    height: a.height,
    rotate: degrees(-a.angle),
  });
}

/** Draw a page's annotations into it, in order (later ones on top). */
export async function drawAnnotations(
  page: PDFPage,
  annotations: Annotation[],
  cache: EmbedCache,
): Promise<void> {
  for (const a of annotations) {
    if (a.kind === "text") await drawText(page, a, cache);
    else await drawImage(page, a, cache);
  }
}

/** Smallest width or height an image annotation can be resized to (points). */
export const MIN_IMAGE_SIZE = 8;

/**
 * New placement of an image annotation after dragging one of its handles.
 *
 * `sx`/`sy` say which handle: -1 for the left/top side, 1 for the right/
 * bottom side, 0 when that axis is not touched (edge handles). `dx`/`dy` is
 * the pointer movement in the image's own frame (points, before rotation).
 * Corner handles keep the proportions when `keepRatio` is set; edge handles
 * always stretch freely. The opposite side stays in place.
 */
export function resizeImage(
  a: Pick<ImageAnnotation, "x" | "y" | "width" | "height" | "angle">,
  sx: -1 | 0 | 1,
  sy: -1 | 0 | 1,
  dx: number,
  dy: number,
  keepRatio: boolean,
): { x: number; y: number; width: number; height: number } {
  let width = Math.max(MIN_IMAGE_SIZE, a.width + sx * dx);
  let height = Math.max(MIN_IMAGE_SIZE, a.height + sy * dy);
  if (keepRatio && sx !== 0 && sy !== 0) {
    const f = Math.max(
      (width / a.width + height / a.height) / 2,
      MIN_IMAGE_SIZE / Math.min(a.width, a.height),
    );
    width = a.width * f;
    height = a.height * f;
  }
  // Moving the left/top side shifts the anchor (the top-left corner).
  const [ox, oy] = rotateVec(sx < 0 ? a.width - width : 0, sy < 0 ? a.height - height : 0, a.angle);
  return { x: a.x + ox, y: a.y + oy, width, height };
}
