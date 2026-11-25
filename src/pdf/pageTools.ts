import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";
import { AppError } from "./errors";

/** Stamps use the standard fonts (English/French): refuse anything else clearly. */
function checkEncodable(font: PDFFont, text: string): void {
  const set = new Set(font.getCharacterSet());
  const missing = [...new Set([...text].filter((ch) => !set.has(ch.codePointAt(0)!)))];
  if (missing.length) {
    throw new AppError("unsupportedChars", `Unsupported characters: ${missing.join(" ")}`, {
      chars: missing.slice(0, 12).join(" "),
    });
  }
}

/**
 * Document-level tools that produce new PDF bytes (the editor then replaces
 * or extends the working document, so every result can be undone).
 */

export const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
} as const;
export type PageSizeName = keyof typeof PAGE_SIZES;

/** A PDF with `count` blank pages of the given size (points). */
export async function blankPagesPdf(count: number, width: number, height: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < Math.max(1, count); i++) doc.addPage([width, height]);
  return doc.save();
}

export interface ImagePageOptions {
  /** "fit": image on an A4/Letter page; "image": page the size of the image (at 96 dpi). */
  pageSize: PageSizeName | "image";
  /** Margin in points (fit mode). */
  margin: number;
}

export interface PageImage {
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  width: number;
  height: number;
}

/**
 * One page per image. In fit mode the page turns to landscape for wide
 * images and the image is centred and scaled to fit inside the margins
 * (never enlarged beyond 1 px = 1 pt... unless smaller than the page).
 */
export async function imagesToPdf(images: PageImage[], opts: ImagePageOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const img of images) {
    const embedded = img.mime === "image/png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
    if (opts.pageSize === "image") {
      const w = (img.width * 72) / 96;
      const h = (img.height * 72) / 96;
      doc.addPage([w, h]).drawImage(embedded, { x: 0, y: 0, width: w, height: h });
      continue;
    }
    const [a, b] = PAGE_SIZES[opts.pageSize];
    const landscape = img.width > img.height;
    const [pw, ph] = landscape ? [b, a] : [a, b];
    const m = Math.max(0, Math.min(opts.margin, Math.min(pw, ph) / 3));
    const k = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
    const w = img.width * k;
    const h = img.height * k;
    doc.addPage([pw, ph]).drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  doc.setProducer("PDF Manager");
  return doc.save();
}

export type NumberPosition = "bottom-center" | "bottom-right" | "top-right";

export interface NumberingOptions {
  position: NumberPosition;
  /** Template with {n} and {total}, e.g. "{n} / {total}" or "Page {n}". */
  template: string;
  start: number;
  size: number;
  /** Zero-based pages to number (default: all). */
  pages?: number[];
}

function visibleBox(page: ReturnType<PDFDocument["getPage"]>) {
  const { x, y, width, height } = page.getCropBox();
  return { x, y, width, height };
}

/**
 * Write text so it reads upright on the displayed page, whatever its
 * /Rotate: compute the position in the displayed frame, then map it back.
 */
function drawUpright(
  page: ReturnType<PDFDocument["getPage"]>,
  text: string,
  font: PDFFont,
  size: number,
  place: (w: number, h: number, textWidth: number) => { x: number; y: number },
  extra: { opacity?: number; angle?: number; color?: ReturnType<typeof rgb> } = {},
) {
  const box = visibleBox(page);
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  const sideways = rot === 90 || rot === 270;
  const dw = sideways ? box.height : box.width;
  const dh = sideways ? box.width : box.height;
  const tw = font.widthOfTextAtSize(text, size);
  const p = place(dw, dh, tw); // displayed frame, origin bottom-left
  // Displayed → unrotated user space.
  let x: number;
  let y: number;
  if (rot === 0) [x, y] = [p.x, p.y];
  else if (rot === 90) [x, y] = [box.width - p.y, p.x];
  else if (rot === 180) [x, y] = [box.width - p.x, box.height - p.y];
  else [x, y] = [p.y, box.height - p.x];
  page.drawText(text, {
    x: box.x + x,
    y: box.y + y,
    size,
    font,
    color: extra.color ?? rgb(0, 0, 0),
    opacity: extra.opacity,
    rotate: degrees(rot + (extra.angle ?? 0)),
  });
}

/** Add page numbers. Uses Helvetica: templates must be English/French text. */
export async function addPageNumbers(bytes: Uint8Array, opts: NumberingOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const targets = opts.pages ?? pages.map((_, i) => i);
  const total = targets.length + opts.start - 1;
  targets.forEach((index, k) => {
    const page = pages[index];
    if (!page) return;
    const text = opts.template.replace(/\{n\}/g, String(k + opts.start)).replace(/\{total\}/g, String(total));
    checkEncodable(font, text);
    const margin = Math.max(18, opts.size * 2);
    drawUpright(page, text, font, opts.size, (w, h, tw) => {
      if (opts.position === "bottom-center") return { x: (w - tw) / 2, y: margin };
      if (opts.position === "bottom-right") return { x: w - margin - tw, y: margin };
      return { x: w - margin - tw, y: h - margin - opts.size };
    });
  });
  return doc.save();
}

export interface WatermarkOptions {
  text: string;
  size: number;
  /** 0–1 */
  opacity: number;
  /** Degrees counter-clockwise (45 = diagonal). */
  angle: number;
  color: [number, number, number];
  pages?: number[];
}

/**
 * Add a text watermark across the centre of each page. It is drawn on top
 * of the page content, semi-transparent. A watermark is ordinary page
 * content: anyone with an editor can remove it — it is not a protection.
 */
export async function addTextWatermark(bytes: Uint8Array, opts: WatermarkOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  checkEncodable(font, opts.text);
  const pages = doc.getPages();
  for (const index of opts.pages ?? pages.map((_, i) => i)) {
    const page = pages[index];
    if (!page) continue;
    const r = (opts.angle * Math.PI) / 180;
    drawUpright(
      page,
      opts.text,
      font,
      opts.size,
      (w, h, tw) => ({
        // Centre the rotated text on the page centre.
        x: w / 2 - (tw / 2) * Math.cos(r) + (opts.size / 3) * Math.sin(r),
        y: h / 2 - (tw / 2) * Math.sin(r) - (opts.size / 3) * Math.cos(r),
      }),
      { opacity: opts.opacity, angle: opts.angle, color: rgb(...opts.color) },
    );
  }
  return doc.save();
}
