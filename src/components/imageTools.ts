import { AppError } from "../pdf/errors";
import type { RasterImage } from "../pdf/background";
import { LIMITS } from "../pdf/limits";
import { SNIFF_BYTES, sniffImage } from "../pdf/imageSniff";

/** Browser-side image helpers (decoding and encoding need a canvas). */

export type ImageMime = "image/png" | "image/jpeg";

/**
 * Read an image file for embedding. PNG and JPEG are kept as they are;
 * other formats the browser can decode (WebP, GIF, BMP) become PNG.
 */
export async function readImage(
  file: File,
): Promise<{ bytes: Uint8Array; mime: ImageMime; width: number; height: number }> {
  const maxMp = Math.round(LIMITS.maxImagePixels / 1_000_000);
  if (file.size > LIMITS.maxImageBytes) {
    throw new AppError("imageTooLarge", "Image file too large.", { max: maxMp });
  }
  // Trust the bytes, not the file name or the reported MIME type.
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const sniffed = sniffImage(head);
  if (!sniffed) throw new AppError("imageType", "Unsupported image.");
  // Check the declared dimensions before decoding (decompression bombs).
  if (sniffed.width && sniffed.height && sniffed.width * sniffed.height > LIMITS.maxImagePixels) {
    throw new AppError("imageTooLarge", "Image dimensions too large.", { max: maxMp });
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new AppError("imageType", "Unsupported image.");
  }
  const { width, height } = bitmap;
  try {
    if (width * height > LIMITS.maxImagePixels) {
      throw new AppError("imageTooLarge", "Image dimensions too large.", { max: maxMp });
    }
    // PNG is kept as it is. JPEG is kept unless it carries EXIF data (camera
    // details, GPS position, orientation): then it is re-encoded from the
    // decoded, correctly oriented pixels so that metadata is not embedded.
    if (sniffed.type === "png" || (sniffed.type === "jpeg" && !sniffed.exif)) {
      const mime = sniffed.type === "png" ? "image/png" : "image/jpeg";
      return { bytes: new Uint8Array(await file.arrayBuffer()), mime, width, height };
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    if (sniffed.type === "jpeg") {
      // Photo with EXIF: re-encode as JPEG (metadata is not copied).
      return { bytes: await canvasToBytes(canvas, "image/jpeg", 0.92), mime: "image/jpeg", width, height };
    }
    return { bytes: await canvasToPng(canvas), mime: "image/png", width, height };
  } finally {
    bitmap.close();
  }
}

/**
 * Decode image bytes to RGBA pixels, scaled down so neither side exceeds
 * `maxSide` (a signature needs no more, and it keeps processing quick).
 */
export async function decodeRaster(
  bytes: Uint8Array,
  mime: ImageMime,
  maxSide = 2000,
): Promise<RasterImage> {
  const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: mime }));
  try {
    const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * k));
    const height = Math.max(1, Math.round(bitmap.height * k));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not create a 2D canvas context.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { width, height, data: ctx.getImageData(0, 0, width, height).data };
  } finally {
    bitmap.close();
  }
}

/** Encode RGBA pixels as PNG (keeps transparency). */
export async function encodePng(img: RasterImage): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a 2D canvas context.");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return canvasToPng(canvas);
}

async function canvasToBytes(
  canvas: HTMLCanvasElement,
  mime: "image/png" | "image/jpeg",
  quality?: number,
): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, quality));
  if (!blob) throw new AppError("imageType", "Could not encode the image.");
  return new Uint8Array(await blob.arrayBuffer());
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return canvasToBytes(canvas, "image/png");
}

/** Object URL that shows the given image bytes. */
export function imageUrl(bytes: Uint8Array, mime: ImageMime): string {
  return URL.createObjectURL(new Blob([bytes.slice()], { type: mime }));
}
