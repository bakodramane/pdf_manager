import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFArray } from "pdf-lib";
import { resizeImage, rotateVec, toPdfPoint } from "./annotations";
import { assemblePdf } from "./assemble";
import type { ImageAnnotation, PageRef, PdfSource, TextAnnotation } from "./types";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

// 1×1 transparent PNG.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

describe("geometry", () => {
  it("rotates clockwise in a y-down frame", () => {
    const [x, y] = rotateVec(1, 0, 90);
    close(x, 0);
    close(y, 1);
  });

  it("maps top-left page points to PDF user space", () => {
    const box = { x: 10, y: 20, width: 200, height: 100 };
    expect(toPdfPoint(box, { x: 0, y: 0, angle: 0 }, 0, 0)).toEqual({ x: 10, y: 120 });
    const p = toPdfPoint(box, { x: 50, y: 30, angle: 90 }, 0, 10);
    // 10 pt "down" the annotation is 10 pt to the left on the page at 90°.
    close(p.x, 50);
    close(p.y, 90);
  });

  it("resizes from a corner keeping proportions", () => {
    const a = { x: 0, y: 0, width: 100, height: 50, angle: 0 };
    const r = resizeImage(a, 1, 1, 20, 0, true);
    close(r.width / r.height, 2);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it("stretches from an edge and keeps the opposite side in place", () => {
    const a = { x: 10, y: 10, width: 100, height: 50, angle: 0 };
    const r = resizeImage(a, -1, 0, 30, 999, true);
    expect(r).toEqual({ x: 40, y: 10, width: 70, height: 50 });
  });

  it("never shrinks below the minimum size", () => {
    const r = resizeImage({ x: 0, y: 0, width: 20, height: 20, angle: 0 }, 1, 1, -500, -500, false);
    expect(r.width).toBe(8);
    expect(r.height).toBe(8);
  });
});

describe("drawing annotations on export", () => {
  async function source(): Promise<PdfSource> {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]).drawRectangle({ x: 10, y: 10, width: 50, height: 50 });
    const bytes = await doc.save();
    return { id: "s", name: "s.pdf", bytes, pageCount: 1 };
  }

  it("draws text and images into the page content", async () => {
    const src = await source();
    const text: TextAnnotation = {
      id: "t",
      kind: "text",
      x: 20,
      y: 30,
      angle: 0,
      text: "Hello — été\nline two « œuvre » 5 €",
      size: 12,
      font: "times",
      bold: true,
      italic: false,
      color: "#ff0000",
    };
    const image: ImageAnnotation = {
      id: "i",
      kind: "image",
      x: 100,
      y: 200,
      angle: 270,
      width: 80,
      height: 40,
      bytes: PNG,
      mime: "image/png",
      url: "",
    };
    const pages: PageRef[] = [
      { id: "p", sourceId: "s", pageIndex: 0, rotation: 90, annotations: [text, image] },
    ];
    const out = await PDFDocument.load(await assemblePdf(pages, () => src));
    const page = out.getPage(0);
    const resources = page.node.Resources()!;
    const fonts = resources.lookup(PDFName.of("Font"));
    const xobjects = resources.lookup(PDFName.of("XObject"));
    expect(fonts).toBeDefined();
    expect(xobjects).toBeDefined();
    expect(page.node.Contents()).toBeInstanceOf(PDFArray);
    expect(page.getRotation().angle).toBe(90);
  });

  async function exportText(text: string): Promise<Uint8Array> {
    const src = await source();
    const a: TextAnnotation = {
      id: "u", kind: "text", x: 20, y: 30, angle: 0, text, size: 14,
      font: "helvetica", bold: false, italic: false, color: "#000000",
    };
    return assemblePdf([{ id: "p", sourceId: "s", pageIndex: 0, rotation: 0, annotations: [a] }], () => src);
  }

  it("keeps English and French text in the standard fonts (no embedded font)", async () => {
    const out = await PDFDocument.load(await exportText("Été, cœur, « guillemets », 12,50 € — Œuvre"));
    const fonts = out.getPage(0).node.Resources()!.lookup(PDFName.of("Font")) as import("pdf-lib").PDFDict;
    const names = fonts.values().map((ref) => (out.context.lookup(ref) as import("pdf-lib").PDFDict).get(PDFName.of("BaseFont"))?.toString());
    expect(names.join(" ")).toMatch(/Helvetica/);
    expect(names.join(" ")).not.toMatch(/Noto/);
  });

  it("embeds the Unicode font for characters outside the standard fonts", async () => {
    const bytes = await exportText("Łódź, Kraków — Αθήνα — Київ — Nguyễn");
    const out = await PDFDocument.load(bytes);
    const fonts = out.getPage(0).node.Resources()!.lookup(PDFName.of("Font")) as import("pdf-lib").PDFDict;
    const names = fonts.values().map((ref) => (out.context.lookup(ref) as import("pdf-lib").PDFDict).get(PDFName.of("BaseFont"))?.toString());
    expect(names.join(" ")).toMatch(/NotoSans/);
    // Extracted text (PDF.js) is the original, not "?" replacements.
    const pdfjs = await import("pdfjs-dist");
    const task = pdfjs.getDocument({ data: bytes.slice() });
    const content = await (await (await task.promise).getPage(1)).getTextContent();
    await task.destroy();
    const extracted = content.items.map((i) => ("str" in i ? i.str : "")).join("");
    expect(extracted).toContain("Łódź");
    expect(extracted).toContain("Αθήνα");
    expect(extracted).toContain("Київ");
    expect(extracted).toContain("Nguyễn");
    expect(extracted).not.toContain("?");
  });

  it("refuses characters no bundled font has, instead of writing '?'", async () => {
    await expect(exportText("Hello 你好 ✓")).rejects.toMatchObject({ code: "unsupportedChars" });
  });

  it("keeps two copies of one page independent", async () => {
    const src = await source();
    const text: TextAnnotation = {
      id: "t",
      kind: "text",
      x: 0,
      y: 0,
      angle: 0,
      text: "only on the first copy",
      size: 10,
      font: "helvetica",
      bold: false,
      italic: false,
      color: "#000000",
    };
    const pages: PageRef[] = [
      { id: "a", sourceId: "s", pageIndex: 0, rotation: 0, annotations: [text] },
      { id: "b", sourceId: "s", pageIndex: 0, rotation: 0 },
    ];
    const out = await PDFDocument.load(await assemblePdf(pages, () => src));
    const count = (i: number) => (out.getPage(i).node.Contents() as PDFArray | undefined)?.size() ?? 1;
    expect(count(0)).toBeGreaterThan(count(1));
  });
});
