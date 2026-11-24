import { AppError } from "../pdf/errors";
import type { RasterImage } from "../pdf/background";

/** Browser-side image helpers (decoding and encoding need a canvas). */

export type ImageMime = "image/png" | "image/jpeg";

/**
 * Read an image file for embedding. PNG and JPEG are kept as they are;
 * other formats the browser can decode (WebP, GIF, BMP) become PNG.
 */
export async function readImage(
  file: File,
): Promise<{ bytes: Uint8Array; mime: ImageMime; width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AppError("imageType", "Unsupported image.");
  }
  const { width, height } = bitmap;
  try {
    if (file.type === "image/png" || file.type === "image/jpeg") {
      return { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type, width, height };
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
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

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new AppError("imageType", "Could not encode the image.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Object URL that shows the given image bytes. */
export function imageUrl(bytes: Uint8Array, mime: ImageMime): string {
  return URL.createObjectURL(new Blob([bytes.slice()], { type: mime }));
}
