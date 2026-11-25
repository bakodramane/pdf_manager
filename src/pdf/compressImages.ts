import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from "pdf-lib";

/**
 * Image optimisation for "Compress": embedded raster images larger than the
 * chosen resolution are downsampled and re-encoded as JPEG. Text, vector
 * drawings, fonts, annotations, form fields and page structure are not
 * touched — only image XObject streams are replaced, keeping their object
 * numbers, soft masks and every reference to them. Images the optimiser does
 * not fully understand (masks, CMYK, indexed colour, 16-bit, JPEG 2000,
 * JBIG2, CCITT, decode arrays…) are left exactly as they are.
 *
 * A replacement is kept only if it is smaller than the original.
 */

export type CompressionProfile = "lossless" | "balanced" | "strong";

export interface ProfileSettings {
  /** Images are downsampled so their long side fits the page at this DPI. */
  dpi: number;
  /** JPEG quality 0–1 for re-encoded images. */
  quality: number;
}

export const PROFILES: Record<Exclude<CompressionProfile, "lossless">, ProfileSettings> = {
  balanced: { dpi: 150, quality: 0.75 },
  strong: { dpi: 100, quality: 0.6 },
};

/** Decoded pixels, 8-bit RGB(A) or grey, row-major. */
export interface Pixels {
  width: number;
  height: number;
  /** 1 (grey), 3 (RGB) or 4 (RGBA). */
  channels: 1 | 3 | 4;
  data: Uint8Array | Uint8ClampedArray;
}

/** Platform image codec (canvas in the browser, @napi-rs/canvas in tests). */
export interface ImageCodec {
  decodeJpeg(bytes: Uint8Array): Promise<Pixels>;
  /** Resize to width×height and encode as JPEG (RGB, no alpha). */
  encodeJpeg(pixels: Pixels, width: number, height: number, quality: number): Promise<Uint8Array>;
}

export interface ImageReport {
  examined: number;
  optimised: number;
  skipped: number;
  deduplicated: number;
  bytesBefore: number;
  bytesAfter: number;
}

const name = (d: PDFDict, key: string) => {
  const v = d.get(PDFName.of(key));
  return v instanceof PDFName ? v.decodeText() : undefined;
};
const num = (d: PDFDict, key: string, ctx: PDFDocument["context"]) => {
  const v = ctx.lookup(d.get(PDFName.of(key)));
  return v instanceof PDFNumber ? v.asNumber() : undefined;
};

/** Colour space → channel count, or null when not plain grey/RGB. */
function channelsOf(dict: PDFDict, ctx: PDFDocument["context"]): 1 | 3 | null {
  const cs = ctx.lookup(dict.get(PDFName.of("ColorSpace")));
  if (cs instanceof PDFName) {
    const n = cs.decodeText();
    return n === "DeviceRGB" ? 3 : n === "DeviceGray" ? 1 : null;
  }
  if (cs instanceof PDFArray && cs.size() === 2) {
    const kind = cs.lookup(0);
    const stream = cs.lookup(1);
    if (kind instanceof PDFName && kind.decodeText() === "ICCBased" && stream instanceof PDFRawStream) {
      const n = num(stream.dict, "N", ctx);
      return n === 3 ? 3 : n === 1 ? 1 : null;
    }
  }
  return null;
}

/** Filters as a list of names (a single name or an array). */
function filtersOf(dict: PDFDict, ctx: PDFDocument["context"]): string[] | null {
  const f = ctx.lookup(dict.get(PDFName.of("Filter")));
  if (f === undefined) return [];
  if (f instanceof PDFName) return [f.decodeText()];
  if (f instanceof PDFArray) {
    const out: string[] = [];
    for (let i = 0; i < f.size(); i++) {
      const n = f.lookup(i);
      if (!(n instanceof PDFName)) return null;
      out.push(n.decodeText());
    }
    return out;
  }
  return null;
}

/** Undo PNG row predictors (PDF /Predictor 10–15). */
export function unpredictPng(data: Uint8Array, columns: number, bpp: number): Uint8Array {
  const rowLen = columns * bpp;
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)];
    const src = r * (rowLen + 1) + 1;
    const dst = r * rowLen;
    for (let i = 0; i < rowLen; i++) {
      const raw = data[src + i];
      const left = i >= bpp ? out[dst + i - bpp] : 0;
      const up = r > 0 ? out[dst - rowLen + i] : 0;
      const upLeft = r > 0 && i >= bpp ? out[dst - rowLen + i - bpp] : 0;
      let v: number;
      switch (type) {
        case 0:
          v = raw;
          break;
        case 1:
          v = raw + left;
          break;
        case 2:
          v = raw + up;
          break;
        case 3:
          v = raw + ((left + up) >> 1);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          v = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          throw new Error("Unknown PNG predictor.");
      }
      out[dst + i] = v & 0xff;
    }
  }
  return out;
}

/** Only merge byte-identical images (the lossless part of image optimisation). */
export function deduplicateOnly(doc: PDFDocument): number {
  const images: [PDFRef, PDFRawStream][] = [];
  const masks = new Set<string>();
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && name(obj.dict, "Subtype") === "Image") {
      images.push([ref, obj]);
      const m = obj.dict.get(PDFName.of("SMask"));
      if (m instanceof PDFRef) masks.add(m.toString());
    }
  }
  return deduplicateImages(doc, images.filter(([r]) => !masks.has(r.toString())));
}

/** Target size so the long side fits the largest page side at `dpi`. */
export function targetSize(width: number, height: number, maxPageSidePt: number, dpi: number): [number, number] {
  const maxSide = Math.max(1, Math.round((maxPageSidePt / 72) * dpi));
  const k = Math.min(1, maxSide / Math.max(width, height));
  return [Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k))];
}

/**
 * Optimise the images of `doc` in place. `signal` aborts between images.
 */
export async function optimiseImages(
  doc: PDFDocument,
  profile: ProfileSettings,
  codec: ImageCodec,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<ImageReport> {
  const ctx = doc.context;
  const report: ImageReport = { examined: 0, optimised: 0, skipped: 0, deduplicated: 0, bytesBefore: 0, bytesAfter: 0 };
  const maxPageSide = Math.max(1, ...doc.getPages().map((p) => Math.max(p.getWidth(), p.getHeight())));

  const images: [PDFRef, PDFRawStream][] = [];
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && name(obj.dict, "Subtype") === "Image") images.push([ref, obj]);
  }
  // Soft masks are images too, but are only ever used as masks: leave them.
  const masks = new Set<string>();
  for (const [, s] of images) {
    const m = s.dict.get(PDFName.of("SMask"));
    if (m instanceof PDFRef) masks.add(m.toString());
  }

  report.deduplicated = deduplicateImages(doc, images.filter(([r]) => !masks.has(r.toString())));

  let done = 0;
  for (const [ref, stream] of images) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    onProgress?.(done++, images.length);
    if (masks.has(ref.toString()) || !ctx.lookup(ref)) continue;
    report.examined += 1;
    const before = stream.contents.length;
    try {
      const replaced = await optimiseOne(ctx, stream, profile, codec, maxPageSide);
      if (replaced && replaced.contents.length < before) {
        ctx.assign(ref, replaced);
        report.optimised += 1;
        report.bytesBefore += before;
        report.bytesAfter += replaced.contents.length;
      } else {
        report.skipped += 1;
      }
    } catch {
      report.skipped += 1; // unreadable: keep the original untouched
    }
  }
  onProgress?.(images.length, images.length);
  return report;
}

async function optimiseOne(
  ctx: PDFDocument["context"],
  stream: PDFRawStream,
  profile: ProfileSettings,
  codec: ImageCodec,
  maxPageSide: number,
): Promise<PDFRawStream | null> {
  const d = stream.dict;
  if (d.get(PDFName.of("ImageMask")) || d.get(PDFName.of("Mask")) || d.get(PDFName.of("Decode"))) return null;
  if (num(d, "BitsPerComponent", ctx) !== 8) return null;
  const channels = channelsOf(d, ctx);
  const width = num(d, "Width", ctx);
  const height = num(d, "Height", ctx);
  const filters = filtersOf(d, ctx);
  if (!channels || !width || !height || !filters) return null;

  const [tw, th] = targetSize(width, height, maxPageSide, profile.dpi);
  if (tw >= width && th >= height) return null; // already at or below target resolution

  let pixels: Pixels;
  if (filters.length === 1 && filters[0] === "DCTDecode") {
    pixels = await codec.decodeJpeg(stream.contents);
  } else if (filters.every((f) => f === "FlateDecode") && filters.length <= 1) {
    let raw = filters.length ? decodePDFRawStream(stream).decode() : stream.contents;
    const parms = ctx.lookup(d.get(PDFName.of("DecodeParms")));
    if (parms instanceof PDFDict) {
      const predictor = num(parms, "Predictor", ctx) ?? 1;
      if (predictor >= 10) {
        const colors = num(parms, "Colors", ctx) ?? 1;
        const columns = num(parms, "Columns", ctx) ?? 1;
        if (colors !== channels || columns !== width) return null;
        raw = unpredictPng(raw, columns, colors);
      } else if (predictor !== 1) {
        return null; // TIFF predictor: not handled
      }
    }
    if (raw.length < width * height * channels) return null;
    pixels = { width, height, channels, data: raw };
  } else {
    return null;
  }

  const jpeg = await codec.encodeJpeg(pixels, tw, th, profile.quality);
  const dict = ctx.obj({
    Type: "XObject",
    Subtype: "Image",
    Width: tw,
    Height: th,
    BitsPerComponent: 8,
    ColorSpace: "DeviceRGB",
    Filter: "DCTDecode",
    Length: jpeg.length,
  });
  for (const key of ["SMask", "Interpolate", "Intent", "Metadata", "OC", "Alternates"]) {
    const v = d.get(PDFName.of(key));
    if (v !== undefined) dict.set(PDFName.of(key), v);
  }
  return PDFRawStream.of(dict, jpeg);
}

/**
 * Point every reference to a byte-identical image stream at one copy.
 * Only XObject resource entries are rewritten, so nothing else changes.
 */
function deduplicateImages(doc: PDFDocument, images: [PDFRef, PDFRawStream][]): number {
  const ctx = doc.context;
  const byKey = new Map<string, PDFRef>();
  const replace = new Map<string, PDFRef>();
  for (const [ref, s] of images) {
    const key = `${s.contents.length}:${hash(s.contents)}:${s.dict.toString()}`;
    const first = byKey.get(key);
    if (first && equalBytes((ctx.lookup(first) as PDFRawStream).contents, s.contents)) replace.set(ref.toString(), first);
    else if (!first) byKey.set(key, ref);
  }
  if (!replace.size) return 0;
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFDict ? obj : obj instanceof PDFRawStream ? obj.dict : null;
    if (!dict) continue;
    // XObject maps live in resource dictionaries, which may be the object
    // itself or nested in a page / form XObject as /Resources.
    const resources = ctx.lookup(dict.get(PDFName.of("Resources")));
    for (const holder of [dict, resources]) {
      if (!(holder instanceof PDFDict)) continue;
      const xobjects = ctx.lookup(holder.get(PDFName.of("XObject")));
      if (!(xobjects instanceof PDFDict)) continue;
      for (const [k, v] of xobjects.entries()) {
        if (v instanceof PDFRef && replace.has(v.toString())) xobjects.set(k, replace.get(v.toString())!);
      }
    }
  }
  // Delete a duplicate only when nothing else (thumbnails, alternates…)
  // still refers to it.
  const stillUsed = referencedRefs(doc);
  let removed = 0;
  for (const key of replace.keys()) {
    if (stillUsed.has(key)) continue;
    const [n, g] = key.split(" ");
    ctx.delete(PDFRef.of(Number(n), Number(g)));
    removed += 1;
  }
  return removed;
}

/** Every indirect reference that appears anywhere in the document. */
function referencedRefs(doc: PDFDocument): Set<string> {
  const ctx = doc.context;
  const seen = new Set<string>();
  const visit = (v: unknown, depth: number): void => {
    if (depth > 64 || v === undefined || v === null) return;
    if (v instanceof PDFRef) {
      seen.add(v.toString());
    } else if (v instanceof PDFDict) {
      for (const [, child] of v.entries()) visit(child, depth + 1);
    } else if (v instanceof PDFArray) {
      for (let i = 0; i < v.size(); i++) visit(v.get(i), depth + 1);
    } else if (v instanceof PDFRawStream) {
      visit(v.dict, depth + 1);
    }
  };
  for (const [, obj] of ctx.enumerateIndirectObjects()) visit(obj, 0);
  visit(ctx.trailerInfo.Root, 0);
  visit(ctx.trailerInfo.Info, 0);
  return seen;
}

function hash(b: Uint8Array): number {
  let h = 2166136261;
  const step = Math.max(1, Math.floor(b.length / 4096));
  for (let i = 0; i < b.length; i += step) h = Math.imul(h ^ b[i], 16777619);
  return h >>> 0;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
