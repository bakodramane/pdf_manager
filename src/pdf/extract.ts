import { AnnotationMode, ImageKind, OPS, Util } from "pdfjs-dist";
import type { PDFPageProxy } from "pdfjs-dist";
import {
  describeFont,
  type FillRect,
  type PageContent,
  type PageImage,
  type Seg,
  type TextChunk,
} from "./layout";

/**
 * Turn a PDF.js page into a PageContent for layout analysis:
 *  - text chunks with position, size and real font family / bold / italic
 *  - horizontal and vertical ruling lines (table borders)
 *  - filled rectangles (cell shading)
 *  - raster images, re-encoded as PNG/JPEG
 *
 * All coordinates are in "display space" (points, origin top-left, y down),
 * which also normalizes rotated pages.
 */

type Matrix = number[];

interface FontInfo {
  font: string;
  bold: boolean;
  italic: boolean;
}

const IMAGE_MAX_SIDE = 2000; // px; keeps the output files reasonably small
const IMAGE_MIN_PT = 12; // ignore bullets, rules and other tiny images

export async function extractPage(
  page: PDFPageProxy,
  options: { images: boolean },
): Promise<PageContent> {
  const viewport = page.getViewport({ scale: 1 });
  // The operator list must be fetched first: it makes PDF.js load the fonts
  // (so their real names are available) and the image objects.
  const opList = await page.getOperatorList({
    annotationMode: AnnotationMode.DISABLE,
  });
  const text = await page.getTextContent();

  // ---- Text ---------------------------------------------------------------
  const fontCache = new Map<string, FontInfo>();
  const fontFor = (fontName: string): FontInfo => {
    let info = fontCache.get(fontName);
    if (info) return info;
    let raw = "";
    let bold = false;
    let italic = false;
    try {
      if (page.commonObjs.has(fontName)) {
        const f = page.commonObjs.get(fontName) as {
          name?: string;
          bold?: boolean;
          black?: boolean;
          italic?: boolean;
        };
        raw = f?.name ?? "";
        bold = !!(f?.bold || f?.black);
        italic = !!f?.italic;
      }
    } catch {
      // Font not resolved; fall back to the generic family below.
    }
    const generic = (text.styles as Record<string, { fontFamily?: string }>)[
      fontName
    ]?.fontFamily;
    const d = describeFont(raw, generic);
    info = { font: d.font, bold: d.bold || bold, italic: d.italic || italic };
    fontCache.set(fontName, info);
    return info;
  };

  const chunks: TextChunk[] = [];
  for (const it of text.items) {
    if (!("str" in it)) continue;
    if (!it.str || !it.str.trim()) continue;
    const tx = Util.transform(viewport.transform, it.transform);
    const a = tx[0];
    const b = tx[1];
    // Keep horizontal text only (drops diagonal watermarks, vertical labels).
    if (!(a > 0 && Math.abs(b) <= a * 0.1)) continue;
    const size = Math.hypot(tx[2], tx[3]);
    if (size < 1) continue;
    const f = fontFor(it.fontName);
    const width = it.width > 0 ? it.width : it.str.length * size * 0.5;
    pushSplitOnWideSpaces(chunks, {
      str: it.str,
      x: tx[4],
      y: tx[5],
      width,
      size,
      font: f.font,
      bold: f.bold,
      italic: f.italic,
    });
  }

  // ---- Vector graphics + images ------------------------------------------
  const hLines: Seg[] = [];
  const vLines: Seg[] = [];
  const fills: FillRect[] = [];
  const imageRefs: { ctm: Matrix; id?: string; inline?: unknown }[] = [];

  let ctm: Matrix = viewport.transform.slice();
  let fillColor = "000000";
  const stack: { ctm: Matrix; fill: string }[] = [];
  let path: ParsedPath | null = null;

  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[];
    switch (fn) {
      case OPS.save:
        stack.push({ ctm, fill: fillColor });
        break;
      case OPS.restore: {
        const s = stack.pop();
        if (s) {
          ctm = s.ctm;
          fillColor = s.fill;
        }
        break;
      }
      case OPS.transform:
        ctm = Util.transform(ctm, args as Matrix);
        break;
      case OPS.paintFormXObjectBegin:
        stack.push({ ctm, fill: fillColor });
        if (Array.isArray(args?.[0]) && (args[0] as Matrix).length === 6) {
          ctm = Util.transform(ctm, args[0] as Matrix);
        }
        break;
      case OPS.paintFormXObjectEnd: {
        const s = stack.pop();
        if (s) {
          ctm = s.ctm;
          fillColor = s.fill;
        }
        break;
      }
      case OPS.setFillRGBColor:
        fillColor = toHex(args);
        break;
      case OPS.constructPath: {
        // PDF.js 5+ merges the painting operator into constructPath.
        const paint = args?.[0] as number;
        const parsed = parsePath(args, ctm);
        if (paint === OPS.stroke || paint === OPS.closeStroke) {
          addStroke(parsed, hLines, vLines);
        } else if (paint === OPS.fill || paint === OPS.eoFill) {
          addFill(parsed, fillColor, hLines, vLines, fills);
        } else if (
          paint === OPS.fillStroke ||
          paint === OPS.eoFillStroke ||
          paint === OPS.closeFillStroke ||
          paint === OPS.closeEOFillStroke
        ) {
          addFill(parsed, fillColor, hLines, vLines, fills);
          addStroke(parsed, hLines, vLines);
        } else {
          // endPath (clipping only) or an older-style unpainted path.
          path = paint === OPS.endPath ? null : parsed;
        }
        break;
      }
      case OPS.stroke:
      case OPS.closeStroke:
        if (path) addStroke(path, hLines, vLines);
        path = null;
        break;
      case OPS.fill:
      case OPS.eoFill:
        if (path) addFill(path, fillColor, hLines, vLines, fills);
        path = null;
        break;
      case OPS.fillStroke:
      case OPS.eoFillStroke:
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        if (path) {
          addFill(path, fillColor, hLines, vLines, fills);
          addStroke(path, hLines, vLines);
        }
        path = null;
        break;
      case OPS.endPath:
        path = null; // clipping path, not painted
        break;
      case OPS.paintImageXObject:
        if (options.images) imageRefs.push({ ctm, id: args[0] as string });
        break;
      case OPS.paintInlineImageXObject:
        if (options.images) imageRefs.push({ ctm, inline: args[0] });
        break;
    }
  }

  const images: PageImage[] = [];
  for (const ref of imageRefs) {
    try {
      const img = await encodeImage(page, ref, viewport.width, viewport.height);
      if (img) images.push(img);
    } catch {
      // Unsupported image encoding: skip it rather than fail the conversion.
    }
  }

  return {
    width: viewport.width,
    height: viewport.height,
    chunks,
    hLines,
    vLines,
    fills,
    images,
  };
}

/**
 * Text drawn with runs of spaces as padding ("Name      Value") arrives as a
 * single item; split it so each part keeps its own approximate x position.
 */
function pushSplitOnWideSpaces(out: TextChunk[], c: TextChunk): void {
  if (!/\S\s{2,}\S/.test(c.str)) {
    out.push(c);
    return;
  }
  const perChar = c.width / c.str.length;
  const re = /\S+(?:\s\S+)*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(c.str))) {
    out.push({
      ...c,
      str: m[0],
      x: c.x + m.index * perChar,
      width: m[0].length * perChar,
    });
  }
}

function toHex(args: unknown[]): string {
  if (typeof args?.[0] === "string") return String(args[0]).replace("#", "").toUpperCase();
  const [r, g, b] = Array.from(args as ArrayLike<number>).map((v) =>
    Math.max(0, Math.min(255, Math.round(Number(v) || 0))),
  );
  return [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

type Pt = [number, number];

interface ParsedPath {
  /** Axis-aligned rectangles in display space: [x0, y0, x1, y1]. */
  rects: [number, number, number, number][];
  /** Straight-line polylines (curves are dropped). */
  polylines: Pt[][];
}

function apply(m: Matrix, x: number, y: number): Pt {
  // PDF.js 5+ transforms the point in place.
  const p: Pt = [x, y];
  Util.applyTransform(p, m);
  return p;
}

/** Path drawing codes used by PDF.js 5+ inside `constructPath` data. */
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

/**
 * Parse a PDF.js 5+ `constructPath` operator. Its arguments are
 * `[paintOp, [pathData], minMax]`, where `pathData` is a flat array of drawing
 * codes, each followed by its coordinates. Rectangles (`re`) arrive as closed
 * move/line sub-paths and are recognised later by `polylineRect`.
 */
export function parsePath(args: unknown[], ctm: Matrix): ParsedPath {
  const container = args?.[1];
  const data = (Array.isArray(container) ? container[0] : container) as ArrayLike<number> | undefined;
  const rects: ParsedPath["rects"] = [];
  const polylines: Pt[][] = [];
  if (!data || typeof data.length !== "number") return { rects, polylines };
  let current: Pt[] = [];
  let curved = false;
  const endSub = () => {
    if (current.length >= 2 && !curved) polylines.push(current);
    current = [];
    curved = false;
  };
  let j = 0;
  while (j < data.length) {
    const op = data[j++];
    switch (op) {
      case DRAW.moveTo:
        endSub();
        current.push(apply(ctm, data[j], data[j + 1]));
        j += 2;
        break;
      case DRAW.lineTo:
        current.push(apply(ctm, data[j], data[j + 1]));
        j += 2;
        break;
      case DRAW.curveTo:
        current.push(apply(ctm, data[j + 4], data[j + 5]));
        curved = true;
        j += 6;
        break;
      case DRAW.quadraticCurveTo:
        current.push(apply(ctm, data[j + 2], data[j + 3]));
        curved = true;
        j += 4;
        break;
      case DRAW.closePath:
        if (current.length) current.push(current[0]);
        break;
      default:
        // Unknown code: stop rather than misread the remaining numbers.
        j = data.length;
    }
  }
  endSub();
  return { rects, polylines };
}

/** A closed 4-sided axis-aligned polyline is really a rectangle. */
function polylineRect(pts: Pt[]): [number, number, number, number] | null {
  if (pts.length < 4 || pts.length > 5) return null;
  for (let i = 1; i < pts.length; i++) {
    const dx = Math.abs(pts[i][0] - pts[i - 1][0]);
    const dy = Math.abs(pts[i][1] - pts[i - 1][1]);
    if (dx > 0.5 && dy > 0.5) return null;
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function addSegment(a: Pt, b: Pt, h: Seg[], v: Seg[]): void {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  if (dy < 1 && dx >= 2) {
    const y = (a[1] + b[1]) / 2;
    h.push({ x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: y, y1: y });
  } else if (dx < 1 && dy >= 2) {
    const x = (a[0] + b[0]) / 2;
    v.push({ x0: x, x1: x, y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) });
  }
}

function addStroke(p: ParsedPath, h: Seg[], v: Seg[]): void {
  for (const [x0, y0, x1, y1] of p.rects) {
    addSegment([x0, y0], [x1, y0], h, v);
    addSegment([x0, y1], [x1, y1], h, v);
    addSegment([x0, y0], [x0, y1], h, v);
    addSegment([x1, y0], [x1, y1], h, v);
  }
  for (const line of p.polylines) {
    for (let i = 1; i < line.length; i++) addSegment(line[i - 1], line[i], h, v);
  }
}

function addFill(
  p: ParsedPath,
  color: string,
  h: Seg[],
  v: Seg[],
  fills: FillRect[],
): void {
  const rects = [...p.rects];
  for (const line of p.polylines) {
    const r = polylineRect(line);
    if (r) rects.push(r);
  }
  for (const [x0, y0, x1, y1] of rects) {
    const w = x1 - x0;
    const ht = y1 - y0;
    // Thin filled rectangles are how many generators draw table rules.
    if (ht <= 2.5 && w > 2) {
      const y = (y0 + y1) / 2;
      h.push({ x0, x1, y0: y, y1: y });
    } else if (w <= 2.5 && ht > 2) {
      const x = (x0 + x1) / 2;
      v.push({ x0: x, x1: x, y0, y1 });
    } else if (w > 2 && ht > 2) {
      fills.push({ x0, y0, x1, y1, color });
    }
  }
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

interface ImgData {
  width: number;
  height: number;
  bitmap?: CanvasImageSource;
  data?: Uint8Array | Uint8ClampedArray;
  kind?: number;
}

function getImageObject(page: PDFPageProxy, id: string): Promise<ImgData | null> {
  const store = id.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 5000);
    try {
      store.get(id, (obj: unknown) => {
        clearTimeout(timer);
        resolve((obj as ImgData) ?? null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Convert PDF.js raw image data (any ImageKind) to a canvas source. */
function toCanvasSource(img: ImgData): CanvasImageSource | null {
  if (img.bitmap) return img.bitmap;
  if (!img.data || !img.width || !img.height) return null;
  const { width: w, height: h, data: src } = img;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const out = ctx.createImageData(w, h);
  const dst = out.data;
  if (img.kind === ImageKind.RGBA_32BPP) {
    dst.set(src.subarray(0, dst.length));
  } else if (img.kind === ImageKind.RGB_24BPP) {
    for (let i = 0, j = 0; i < dst.length; i += 4, j += 3) {
      dst[i] = src[j];
      dst[i + 1] = src[j + 1];
      dst[i + 2] = src[j + 2];
      dst[i + 3] = 255;
    }
  } else if (img.kind === ImageKind.GRAYSCALE_1BPP) {
    const rowBytes = (w + 7) >> 3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bit = (src[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const i = (y * w + x) * 4;
        dst[i] = dst[i + 1] = dst[i + 2] = v;
        dst[i + 3] = 255;
      }
    }
  } else {
    return null;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

async function encodeImage(
  page: PDFPageProxy,
  ref: { ctm: Matrix; id?: string; inline?: unknown },
  pageW: number,
  pageH: number,
): Promise<PageImage | null> {
  if (typeof document === "undefined") return null;
  // Image space is the unit square, mapped to the page by the CTM.
  const p00 = apply(ref.ctm, 0, 0);
  const p10 = apply(ref.ctm, 1, 0);
  const p01 = apply(ref.ctm, 0, 1);
  const p11 = apply(ref.ctm, 1, 1);
  const xs = [p00[0], p10[0], p01[0], p11[0]];
  const ys = [p00[1], p10[1], p01[1], p11[1]];
  const box = {
    x0: Math.max(0, Math.min(...xs)),
    y0: Math.max(0, Math.min(...ys)),
    x1: Math.min(pageW, Math.max(...xs)),
    y1: Math.min(pageH, Math.max(...ys)),
  };
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  if (bw < IMAGE_MIN_PT || bh < IMAGE_MIN_PT) return null;

  const obj = ref.id
    ? await getImageObject(page, ref.id)
    : (ref.inline as ImgData | undefined) ?? null;
  if (!obj || !obj.width || !obj.height) return null;
  const source = toCanvasSource(obj);
  if (!source) return null;

  // Render at roughly the image's native resolution, capped.
  const lenX = Math.hypot(p10[0] - p00[0], p10[1] - p00[1]) || 1;
  const lenY = Math.hypot(p01[0] - p00[0], p01[1] - p00[1]) || 1;
  let scale = Math.max(obj.width / lenX, obj.height / lenY, 1);
  scale = Math.min(scale, IMAGE_MAX_SIDE / Math.max(bw, bh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bw * scale));
  canvas.height = Math.max(1, Math.round(bh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  // Same mapping PDF.js uses: display <- CTM <- unit square <- image pixels.
  ctx.setTransform(scale, 0, 0, scale, -box.x0 * scale, -box.y0 * scale);
  const [a, b, c, d, e, f] = ref.ctm;
  ctx.transform(a, b, c, d, e, f);
  ctx.scale(1 / obj.width, -1 / obj.height);
  ctx.drawImage(source, 0, -obj.height, obj.width, obj.height);

  // JPEG for opaque images (much smaller for photos), PNG when transparent.
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let opaque = true;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 250) {
      opaque = false;
      break;
    }
  }
  const format = opaque ? "jpg" : "png";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, opaque ? "image/jpeg" : "image/png", 0.88),
  );
  if (!blob) return null;
  return { ...box, format, data: new Uint8Array(await blob.arrayBuffer()) };
}
