import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Overlays operate on already-assembled PDF bytes and return new bytes.
 * Positions are given as fractions of the page (0..1) measured from the
 * TOP-LEFT corner, which is friendlier for a UI than PDF's bottom-left origin.
 */

export interface TextOverlaySpec {
  pageIndex: number;
  text: string;
  /** 0..1 from left, 0..1 from top. */
  x: number;
  y: number;
  size: number;
  color?: { r: number; g: number; b: number }; // 0..1 channels
}

export interface ImageOverlaySpec {
  pageIndex: number;
  imageBytes: Uint8Array;
  mime: string;
  /** 0..1 from left/top — anchors the image's top-left corner. */
  x: number;
  y: number;
  /** Target width as a fraction of page width (0..1). Aspect kept. */
  widthFraction: number;
}

export async function applyTextOverlay(
  pdfBytes: Uint8Array,
  spec: TextOverlaySpec,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPage(spec.pageIndex);
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const c = spec.color ?? { r: 0, g: 0, b: 0 };
  page.drawText(spec.text, {
    x: spec.x * width,
    y: height - spec.y * height - spec.size, // convert top-left -> bottom-left
    size: spec.size,
    font,
    color: rgb(c.r, c.g, c.b),
  });
  return doc.save();
}

export async function applyImageOverlay(
  pdfBytes: Uint8Array,
  spec: ImageOverlaySpec,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPage(spec.pageIndex);
  const { width, height } = page.getSize();

  const isPng = /png/i.test(spec.mime);
  const image = isPng
    ? await doc.embedPng(spec.imageBytes)
    : await doc.embedJpg(spec.imageBytes);

  const targetW = spec.widthFraction * width;
  const scale = targetW / image.width;
  const targetH = image.height * scale;

  page.drawImage(image, {
    x: spec.x * width,
    y: height - spec.y * height - targetH, // top-left anchor -> bottom-left
    width: targetW,
    height: targetH,
  });
  return doc.save();
}
