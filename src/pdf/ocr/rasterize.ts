import type { PDFPageProxy } from "pdfjs-dist";
import { fitPixels } from "../limits";

/** Anything canvas-like PDF.js can draw into (DOM canvas or a Node canvas). */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: "2d"): unknown;
}

export interface Raster<C extends CanvasLike = CanvasLike> {
  canvas: C;
  /** PDF user space → raster pixels. */
  transform: [number, number, number, number, number, number];
  dpi: number;
}

/**
 * Render a page as it is displayed (its own /Rotate applied, crop box
 * respected) at `dpi`, capped to `maxPixels`. Annotations and form fields
 * are drawn too, so visible field values are recognised.
 */
export async function rasterizePage<C extends CanvasLike>(
  page: PDFPageProxy,
  dpi: number,
  maxPixels: number,
  createCanvas: (w: number, h: number) => C,
  signal?: AbortSignal,
): Promise<Raster<C>> {
  const base = page.getViewport({ scale: 1, rotation: page.rotate });
  let scale = dpi / 72;
  scale *= fitPixels(base.width * scale, base.height * scale, maxPixels);
  const viewport = page.getViewport({ scale, rotation: page.rotate });
  const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  // OCR works on an opaque white background.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: ctx,
    viewport,
  });
  const onAbort = () => task.cancel();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await task.promise;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
  return {
    canvas,
    transform: viewport.transform.slice(0, 6) as Raster["transform"],
    dpi: scale * 72,
  };
}
