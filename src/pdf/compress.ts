import { PDFDocument } from "pdf-lib";
import {
  PROFILES,
  deduplicateOnly,
  optimiseImages,
  type CompressionProfile,
  type ImageCodec,
  type ImageReport,
} from "./compressImages";

export type { CompressionProfile } from "./compressImages";

export interface CompressResult {
  bytes: Uint8Array;
  /** Image statistics (null for the lossless profile). */
  images: ImageReport | null;
  /** Duplicate images merged (all profiles). */
  deduplicated: number;
}

/**
 * Compress a PDF.
 * - "lossless": rewrites the structure with object streams and merges
 *   byte-identical images. Page content is unchanged.
 * - "balanced" / "strong": additionally downsample and re-encode large
 *   images as JPEG (lossy). Text, vectors, fonts, forms and annotations
 *   are kept as they are.
 * The caller compares sizes and keeps the original when nothing is gained.
 */
export async function compressPdf(
  bytes: Uint8Array,
  profile: CompressionProfile = "lossless",
  codec?: ImageCodec,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<CompressResult> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  let images: ImageReport | null = null;
  let deduplicated: number;
  if (profile === "lossless") {
    deduplicated = deduplicateOnly(doc);
  } else {
    if (!codec) throw new Error("An image codec is required for lossy profiles.");
    images = await optimiseImages(doc, PROFILES[profile], codec, signal, onProgress);
    deduplicated = images.deduplicated;
  }
  const out = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  return { bytes: out, images, deduplicated };
}
