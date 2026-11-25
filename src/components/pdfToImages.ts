import * as pdfjs from "pdfjs-dist";
import { SAFE_DOCUMENT_OPTIONS } from "../pdf/render";
import { LIMITS } from "../pdf/limits";
import { rasterizePage } from "../pdf/ocr/rasterize";
import { deriveName } from "../pdf/filenames";

export type ImageFormat = "png" | "jpeg";

/**
 * Render pages to PNG or JPEG files (locally). One page gives one image;
 * several pages are packed into a .zip with safe, numbered names.
 */
export async function pdfToImages(
  bytes: Uint8Array,
  pageIndices: number[],
  opts: { format: ImageFormat; dpi: number; quality: number; baseName: string },
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<{ bytes: Uint8Array; name: string; mime: string }> {
  const task = pdfjs.getDocument({ data: bytes.slice(), ...SAFE_DOCUMENT_OPTIONS });
  const files: { name: string; data: Uint8Array }[] = [];
  const mime = opts.format === "png" ? "image/png" : "image/jpeg";
  const ext = opts.format === "png" ? "png" : "jpg";
  try {
    const doc = await task.promise;
    const dpi = Math.min(opts.dpi, LIMITS.maxRenderDpi);
    const digits = String(doc.numPages).length;
    for (let i = 0; i < pageIndices.length; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      onProgress?.(i, pageIndices.length);
      const page = await doc.getPage(pageIndices[i] + 1);
      const r = await rasterizePage(
        page,
        dpi,
        LIMITS.maxRenderPixels,
        (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }),
        signal,
      );
      const blob = await new Promise<Blob | null>((res) => r.canvas.toBlob(res, mime, opts.quality));
      r.canvas.width = 0;
      page.cleanup();
      if (!blob) throw new Error("Image encoding failed.");
      const n = String(pageIndices[i] + 1).padStart(digits, "0");
      files.push({ name: deriveName(opts.baseName, `_p${n}`, ext), data: new Uint8Array(await blob.arrayBuffer()) });
    }
    onProgress?.(pageIndices.length, pageIndices.length);
  } finally {
    await task.destroy().catch(() => undefined);
  }
  if (files.length === 1) return { bytes: files[0].data, name: files[0].name, mime };
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.data, { binary: true });
  const out = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  return { bytes: out, name: deriveName(opts.baseName, "_images", "zip"), mime: "application/zip" };
}
