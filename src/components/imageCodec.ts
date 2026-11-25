import type { ImageCodec, Pixels } from "../pdf/compressImages";
import { LIMITS } from "../pdf/limits";

/** Browser image codec for compression (canvas based, fully local). */
export const browserCodec: ImageCodec = {
  async decodeJpeg(bytes) {
    const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: "image/jpeg" }));
    try {
      if (bitmap.width * bitmap.height > LIMITS.maxImagePixels) throw new Error("Image too large.");
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("No 2D context.");
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      canvas.width = 0;
      return { width: bitmap.width, height: bitmap.height, channels: 4, data };
    } finally {
      bitmap.close();
    }
  },

  async encodeJpeg(pixels, width, height, quality) {
    if (pixels.width * pixels.height > LIMITS.maxImagePixels) throw new Error("Image too large.");
    const src = document.createElement("canvas");
    src.width = pixels.width;
    src.height = pixels.height;
    src.getContext("2d")!.putImageData(new ImageData(toRgba(pixels), pixels.width, pixels.height), 0, 0);
    const dst = document.createElement("canvas");
    dst.width = width;
    dst.height = height;
    const ctx = dst.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; // JPEG has no alpha
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, width, height);
    src.width = 0;
    const blob = await new Promise<Blob | null>((res) => dst.toBlob(res, "image/jpeg", quality));
    dst.width = 0;
    if (!blob) throw new Error("JPEG encoding failed.");
    return new Uint8Array(await blob.arrayBuffer());
  },
};

export function toRgba(p: Pixels): Uint8ClampedArray<ArrayBuffer> {
  if (p.channels === 4) return new Uint8ClampedArray(p.data);
  const out = new Uint8ClampedArray(p.width * p.height * 4);
  for (let i = 0, j = 0; i < p.width * p.height; i++, j += 4) {
    if (p.channels === 1) {
      const g = p.data[i];
      out[j] = out[j + 1] = out[j + 2] = g;
    } else {
      out[j] = p.data[i * 3];
      out[j + 1] = p.data[i * 3 + 1];
      out[j + 2] = p.data[i * 3 + 2];
    }
    out[j + 3] = 255;
  }
  return out;
}
