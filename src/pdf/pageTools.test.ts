// @vitest-environment node
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDict, PDFDocument, PDFName, degrees } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { addPageNumbers, addTextWatermark, blankPagesPdf, imagesToPdf } from "./pageTools";
import { duplicatePages, shiftPages } from "./operations";
import type { PageRef } from "./types";

const dir = mkdtempSync(join(tmpdir(), "pdfm-tools-"));
const hasPoppler = (() => {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** Words with their displayed-page boxes, from Poppler. */
function words(bytes: Uint8Array, name: string) {
  const file = join(dir, name);
  writeFileSync(file, bytes);
  const html = execFileSync("pdftotext", ["-bbox", file, "-"]).toString("utf8");
  // Poppler's <page> size is unrotated while word boxes are in the displayed
  // frame: swap for the 90/270° pages of mixedPdf().
  const pages = html.split("<page ").slice(1).map((p, i) => {
    const [, pw, ph] = p.match(/width="([\d.]+)" height="([\d.]+)"/)!.map(Number);
    const [w, h] = ROTATIONS[i] === 90 || ROTATIONS[i] === 270 ? [ph, pw] : [pw, ph];
    const ws = [...p.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map(
      (m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], text: m[5] }),
    );
    return { w, h, words: ws };
  });
  return pages;
}

const ROTATIONS = [0, 0, 90, 270];

async function mixedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  doc.addPage([842, 595]);
  const r = doc.addPage([595, 842]);
  r.setRotation(degrees(90));
  const r2 = doc.addPage([595, 842]);
  r2.setRotation(degrees(270));
  return doc.save();
}

function png(w: number, h: number): Uint8Array {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#3a7";
  ctx.fillRect(0, 0, w, h);
  return new Uint8Array(c.toBuffer("image/png"));
}

describe("page list operations", () => {
  const ref = (id: string): PageRef => ({ id, sourceId: "s", pageIndex: 0, rotation: 0, annotations: [] });
  let n = 0;
  const newId = (p: string) => `${p}_${++n}`;

  it("duplicates selected pages right after themselves with fresh ids", () => {
    const pages = [ref("a"), { ...ref("b"), annotations: [{ id: "x", kind: "text" } as never] }, ref("c")];
    const out = duplicatePages(pages, new Set(["b"]), newId);
    expect(out.map((p) => p.id)).toEqual(["a", "b", "pg_1", "c"]);
    expect(out[2].annotations![0].id).not.toBe("x");
  });

  it("moves selected pages by one step, keeping their order", () => {
    const pages = ["a", "b", "c", "d"].map(ref);
    expect(shiftPages(pages, new Set(["b", "c"]), -1).map((p) => p.id)).toEqual(["b", "c", "a", "d"]);
    expect(shiftPages(pages, new Set(["b", "c"]), 1).map((p) => p.id)).toEqual(["a", "d", "b", "c"]);
    expect(shiftPages(pages, new Set(["a"]), -1).map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("generated pages", () => {
  it("creates blank pages of the requested size", async () => {
    const doc = await PDFDocument.load(await blankPagesPdf(2, 612, 792));
    expect(doc.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([[612, 792], [612, 792]]);
  });

  it("turns images into fitted pages (landscape for wide images)", async () => {
    const out = await imagesToPdf(
      [
        { bytes: png(400, 300), mime: "image/png", width: 400, height: 300 },
        { bytes: png(300, 600), mime: "image/png", width: 300, height: 600 },
      ],
      { pageSize: "a4", margin: 36 },
    );
    const doc = await PDFDocument.load(out);
    const sizes = doc.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
    expect(sizes).toEqual([[842, 595], [595, 842]]);
    const own = await PDFDocument.load(await imagesToPdf([{ bytes: png(960, 480), mime: "image/png", width: 960, height: 480 }], { pageSize: "image", margin: 0 }));
    expect([own.getPage(0).getWidth(), own.getPage(0).getHeight()]).toEqual([720, 360]);
  });
});

describe("stamps on mixed sizes and rotations", () => {
  it("numbers pages at the bottom centre of the displayed page", async () => {
    if (!hasPoppler) return;
    const input = await mixedPdf();
    const copy = input.slice();
    const out = await addPageNumbers(input, { position: "bottom-center", template: "{n} / {total}", start: 1, size: 12 });
    expect(input).toEqual(copy); // the input bytes are never modified
    const pages = words(out, "numbers.pdf");
    expect(pages).toHaveLength(4);
    pages.forEach((p, i) => {
      const first = p.words.find((w) => w.text === String(i + 1))!;
      expect(first).toBeDefined();
      // Centred horizontally, near the bottom (Poppler's y grows downwards).
      expect(Math.abs((first.x0 + p.words[p.words.length - 1].x1) / 2 - p.w / 2)).toBeLessThan(10);
      expect(first.y1).toBeGreaterThan(p.h - 40);
    });
  });

  it("adds a centred, semi-transparent watermark that reads upright", async () => {
    if (!hasPoppler) return;
    const out = await addTextWatermark(await mixedPdf(), {
      text: "CONFIDENTIEL",
      size: 48,
      opacity: 0.2,
      angle: 0,
      color: [0.8, 0, 0],
    });
    for (const p of words(out, "wm.pdf")) {
      const w = p.words.find((x) => x.text === "CONFIDENTIEL")!;
      expect(w).toBeDefined();
      expect(Math.abs((w.x0 + w.x1) / 2 - p.w / 2)).toBeLessThan(6);
      expect(Math.abs((w.y0 + w.y1) / 2 - p.h / 2)).toBeLessThan(12);
      expect(w.x1 - w.x0).toBeGreaterThan(w.y1 - w.y0); // horizontal on screen
    }
    // Semi-transparent: an ExtGState with fill alpha 0.2 on each page.
    const doc = await PDFDocument.load(out);
    for (const page of doc.getPages()) {
      const gs = page.node.Resources()!.lookup(PDFName.of("ExtGState"), PDFDict);
      const alphas = gs.values().map((v) => (doc.context.lookup(v) as PDFDict).get(PDFName.of("ca"))?.toString());
      expect(alphas).toContain("0.2");
    }
  });
});
