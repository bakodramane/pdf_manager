import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { assemblePdf, deriveName } from "./assemble";
import { deletePages } from "./operations";
import type { PageRef, PdfSource } from "./types";

/** Build a real in-memory PDF with `n` pages for testing. */
async function makeSource(id: string, n: number): Promise<PdfSource> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([200, 200]);
  const bytes = await doc.save();
  return { id, name: `${id}.pdf`, bytes, pageCount: n };
}

describe("assemblePdf", () => {
  it("rebuilds a PDF from page refs in order with rotation", async () => {
    const src = await makeSource("a", 3);
    const sources = new Map([[src.id, src]]);
    const pages: PageRef[] = [
      { id: "p2", sourceId: "a", pageIndex: 2, rotation: 90 },
      { id: "p0", sourceId: "a", pageIndex: 0, rotation: 0 },
    ];
    const out = await assemblePdf(pages, (id) => sources.get(id));
    const result = await PDFDocument.load(out);
    expect(result.getPageCount()).toBe(2);
    expect(result.getPage(0).getRotation().angle).toBe(90);
  });

  it("merges pages from two sources", async () => {
    const a = await makeSource("a", 2);
    const b = await makeSource("b", 1);
    const sources = new Map([
      [a.id, a],
      [b.id, b],
    ]);
    const pages: PageRef[] = [
      { id: "1", sourceId: "a", pageIndex: 0, rotation: 0 },
      { id: "2", sourceId: "b", pageIndex: 0, rotation: 0 },
      { id: "3", sourceId: "a", pageIndex: 1, rotation: 0 },
    ];
    const out = await assemblePdf(pages, (id) => sources.get(id));
    const result = await PDFDocument.load(out);
    expect(result.getPageCount()).toBe(3);
  });

  it("respects deletions before assembly", async () => {
    const src = await makeSource("a", 3);
    const sources = new Map([[src.id, src]]);
    const pages: PageRef[] = [0, 1, 2].map((i) => ({
      id: `p${i}`,
      sourceId: "a",
      pageIndex: i,
      rotation: 0 as const,
    }));
    const kept = deletePages(pages, new Set(["p1"]));
    const out = await assemblePdf(kept, (id) => sources.get(id));
    const result = await PDFDocument.load(out);
    expect(result.getPageCount()).toBe(2);
  });

  it("throws on an empty document", async () => {
    await expect(assemblePdf([], () => undefined)).rejects.toThrow();
  });
});

describe("deriveName", () => {
  it("inserts a suffix before the extension", () => {
    expect(deriveName("report.pdf", "_edited")).toBe("report_edited.pdf");
    expect(deriveName("report.pdf", "", "docx")).toBe("report.docx");
    expect(deriveName("noext", "_x")).toBe("noext_x.pdf");
  });
});
