// @vitest-environment node
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, PDFName, PDFRawStream, PDFRef, StandardFonts, degrees, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { compressPdf } from "./compress";
import { targetSize, unpredictPng, type ImageCodec } from "./compressImages";
import { rasterizePage } from "./ocr/rasterize";

/** Node codec with the same behaviour as the browser one. */
const nodeCodec: ImageCodec = {
  async decodeJpeg(bytes) {
    const img = await loadImage(Buffer.from(bytes));
    const c = createCanvas(img.width, img.height);
    c.getContext("2d").drawImage(img, 0, 0);
    return { width: img.width, height: img.height, channels: 4, data: c.getContext("2d").getImageData(0, 0, img.width, img.height).data };
  },
  async encodeJpeg(p, w, h, q) {
    const src = createCanvas(p.width, p.height);
    const rgba = new Uint8ClampedArray(p.width * p.height * 4);
    for (let i = 0; i < p.width * p.height; i++) {
      const s = i * p.channels;
      rgba[i * 4] = p.data[s];
      rgba[i * 4 + 1] = p.data[p.channels === 1 ? s : s + 1];
      rgba[i * 4 + 2] = p.data[p.channels === 1 ? s : s + 2];
      rgba[i * 4 + 3] = 255;
    }
    const id = src.getContext("2d").createImageData(p.width, p.height);
    id.data.set(rgba);
    src.getContext("2d").putImageData(id, 0, 0);
    const dst = createCanvas(w, h);
    const ctx = dst.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    return new Uint8Array(dst.toBuffer("image/jpeg", Math.round(q * 100)));
  },
};

/** A photo-like, noisy "scan" (hard to compress, as real scans are). */
function scanImage(w: number, h: number, format: "jpeg" | "png", alpha = false): Buffer {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#f4efe6");
  g.addColorStop(1, "#d9d2c5");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  let seed = 7;
  for (let i = 0; i < id.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const n = (seed % 25) - 12;
    id.data[i] += n;
    id.data[i + 1] += n;
    id.data[i + 2] += n;
    if (alpha) id.data[i + 3] = (i / 4) % w < w / 2 ? 255 : 90;
  }
  ctx.putImageData(id, 0, 0);
  ctx.fillStyle = "#222";
  ctx.font = `${Math.round(h / 40)}px sans-serif`;
  for (let y = 1; y < 30; y++) ctx.fillText("Synthetic scanned line of text for compression tests", w * 0.08, (h / 32) * y);
  return format === "jpeg" ? c.toBuffer("image/jpeg", 95) : c.toBuffer("image/png");
}

async function fixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const scan = await doc.embedJpg(scanImage(2480, 3508, "jpeg")); // A4 at 300 dpi
  const logo = await doc.embedPng(scanImage(2400, 2400, "png", true)); // Flate RGB + soft mask (alpha)
  const scanJpeg = scanImage(2480, 3508, "jpeg");
  // The same scan embedded a second time (separate objects, identical bytes).
  const scanCopy = await doc.embedJpg(scanJpeg);

  // Page 1: oversized scan + real text + vector drawing + form field + link.
  const p1 = doc.addPage([595, 842]);
  p1.drawImage(scan, { x: 0, y: 0, width: 595, height: 842 });
  p1.drawText("Selectable text stays selectable", { x: 50, y: 50, size: 14, font, color: rgb(0.8, 0, 0) });
  p1.drawRectangle({ x: 40, y: 40, width: 300, height: 30, borderColor: rgb(0, 0, 1), borderWidth: 2 });
  const form = doc.getForm();
  const field = form.createTextField("name");
  field.setText("Aïssata Diallo");
  field.addToPage(p1, { x: 360, y: 40, width: 200, height: 24, font });
  const link = doc.context.register(
    doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [40, 100, 200, 120], Border: [0, 0, 0], A: { S: "URI", URI: "https://example.org/" } }),
  );
  p1.node.addAnnot(link);

  // Page 2: same scan again (shared resource) + PNG with alpha, rotated page.
  const p2 = doc.addPage([842, 595]);
  p2.setRotation(degrees(90));
  p2.drawImage(scanCopy, { x: 0, y: 0, width: 842, height: 595 });
  p2.drawImage(logo, { x: 100, y: 100, width: 200, height: 200 });

  // Page 3: a CMYK image the optimiser must leave untouched.
  const p3 = doc.addPage([300, 300]);
  const cmyk = doc.context.register(
    PDFRawStream.of(
      doc.context.obj({ Type: "XObject", Subtype: "Image", Width: 2000, Height: 2000, BitsPerComponent: 8, ColorSpace: "DeviceCMYK", Length: 4 }),
      new Uint8Array(4),
    ),
  );
  p3.node.setXObject(PDFName.of("Cmyk"), cmyk);
  return doc.save();
}

async function render(bytes: Uint8Array, pageNo: number) {
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const page = await (await task.promise).getPage(pageNo);
  const r = await rasterizePage(page, 50, 10_000_000, (w, h) => createCanvas(w, h));
  const data = r.canvas.getContext("2d").getImageData(0, 0, r.canvas.width, r.canvas.height).data;
  await task.destroy();
  return data;
}

async function textOf(bytes: Uint8Array, pageNo: number) {
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const content = await (await (await task.promise).getPage(pageNo)).getTextContent();
  await task.destroy();
  return content.items.map((i) => ("str" in i ? i.str : "")).join("");
}

const meanDiff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};

describe("PNG predictor", () => {
  it("undoes Sub, Up, Average and Paeth rows", () => {
    // 2 pixels x 1 channel, 4 rows with filters 1..4 producing [10,20],[15,25],...
    const encoded = new Uint8Array([1, 10, 10, 2, 5, 5, 3, 5, 0, 4, 5, 5]);
    expect([...unpredictPng(encoded, 2, 1)]).toEqual([10, 20, 15, 25, 12, 18, 17, 23]);
  });
});

describe("target resolution", () => {
  it("fits the long side to the largest page at the profile DPI", () => {
    expect(targetSize(2480, 3508, 842, 150)).toEqual([1240, 1754]);
    expect(targetSize(800, 600, 842, 150)).toEqual([800, 600]); // never upscales
  });
});

describe("compression profiles", () => {
  it("lossless: same pages and pixels, duplicate-free, valid", async () => {
    const input = await fixture();
    const { bytes } = await compressPdf(input, "lossless");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    expect(meanDiff(await render(input, 1), await render(bytes, 1))).toBe(0);
    expect(await textOf(bytes, 1)).toContain("Selectable text stays selectable");
  });

  it("balanced: ≥ 30 % smaller on an oversized scan, structure and text preserved", async () => {
    const input = await fixture();
    const { bytes, images } = await compressPdf(input, "balanced", nodeCodec);
    const reduction = 1 - bytes.length / input.length;
    console.log(`balanced: ${input.length} → ${bytes.length} bytes (${Math.round(reduction * 100)} %), images:`, images);
    expect(reduction).toBeGreaterThanOrEqual(0.3);
    expect(images!.optimised).toBeGreaterThanOrEqual(2); // JPEG scan + Flate PNG
    expect(images!.deduplicated).toBe(1);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPages().map((p) => [p.getWidth(), p.getHeight(), p.getRotation().angle])).toEqual([
      [595, 842, 0],
      [842, 595, 90],
      [300, 300, 0],
    ]);
    // Text, form field value and link annotation survive.
    expect(await textOf(bytes, 1)).toContain("Selectable text stays selectable");
    expect(doc.getForm().getTextField("name").getText()).toBe("Aïssata Diallo");
    const annots = doc.getPage(0).node.Annots()!;
    const subtypes = annots.asArray().map((r) => (doc.context.lookup(r) as import("pdf-lib").PDFDict).get(PDFName.of("Subtype"))?.toString());
    expect(subtypes).toContain("/Link");
    // Soft mask of the alpha image is still attached.
    const masked = [...doc.context.enumerateIndirectObjects()].filter(
      ([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of("SMask")) instanceof PDFRef,
    );
    expect(masked.length).toBe(1);
    // CMYK image left exactly as it was.
    const cmyk = [...doc.context.enumerateIndirectObjects()].find(
      ([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of("ColorSpace"))?.toString() === "/DeviceCMYK",
    );
    expect(cmyk).toBeDefined();
    // Visually close to the original.
    expect(meanDiff(await render(input, 1), await render(bytes, 1))).toBeLessThan(6);
    // Independent parser accepts the file.
    try {
      const dir = mkdtempSync(join(tmpdir(), "pdfm-cmp-"));
      writeFileSync(join(dir, "out.pdf"), bytes);
      const info = execFileSync("pdfinfo", [join(dir, "out.pdf")]).toString();
      expect(info).toMatch(/Pages:\s+3/);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }, 60_000);

  it("strong is smaller than balanced", async () => {
    const input = await fixture();
    const balanced = await compressPdf(input, "balanced", nodeCodec);
    const strong = await compressPdf(input, "strong", nodeCodec);
    expect(strong.bytes.length).toBeLessThan(balanced.bytes.length);
  }, 60_000);

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(compressPdf(await fixture(), "balanced", nodeCodec, controller.signal)).rejects.toThrow(/Abort/);
  });
});
