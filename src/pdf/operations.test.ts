import { describe, expect, it } from "vitest";
import {
  deletePages,
  extractPages,
  insertPages,
  movePage,
  normalizeRotation,
  rotatePages,
  splitIntoRanges,
} from "./operations";
import type { PageRef } from "./types";

function mk(n: number): PageRef[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    sourceId: "s",
    pageIndex: i,
    rotation: 0 as const,
  }));
}

const ids = (pages: PageRef[]) => pages.map((p) => p.id);

describe("normalizeRotation", () => {
  it("wraps into 0/90/180/270", () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
  });
});

describe("deletePages", () => {
  it("removes selected ids and keeps order", () => {
    const pages = mk(4);
    const out = deletePages(pages, new Set(["p1", "p3"]));
    expect(ids(out)).toEqual(["p0", "p2"]);
  });
  it("does not mutate the input", () => {
    const pages = mk(2);
    deletePages(pages, new Set(["p0"]));
    expect(pages).toHaveLength(2);
  });
});

describe("rotatePages", () => {
  it("rotates only selected pages and composes", () => {
    const pages = rotatePages(mk(2), new Set(["p0"]), 90);
    expect(pages[0].rotation).toBe(90);
    expect(pages[1].rotation).toBe(0);
    const again = rotatePages(pages, new Set(["p0"]), 270);
    expect(again[0].rotation).toBe(0);
  });
});

describe("extractPages", () => {
  it("keeps only selected, preserving order", () => {
    const out = extractPages(mk(4), new Set(["p2", "p0"]));
    expect(ids(out)).toEqual(["p0", "p2"]);
  });
});

describe("movePage", () => {
  it("moves forward and backward", () => {
    expect(ids(movePage(mk(4), 0, 2))).toEqual(["p1", "p2", "p0", "p3"]);
    expect(ids(movePage(mk(4), 3, 0))).toEqual(["p3", "p0", "p1", "p2"]);
  });
  it("is a no-op for equal indices", () => {
    expect(ids(movePage(mk(3), 1, 1))).toEqual(["p0", "p1", "p2"]);
  });
});

describe("insertPages", () => {
  const extra: PageRef[] = [
    { id: "x0", sourceId: "t", pageIndex: 0, rotation: 0 },
  ];
  it("inserts at the beginning with afterIndex -1", () => {
    expect(ids(insertPages(mk(2), extra, -1))).toEqual(["x0", "p0", "p1"]);
  });
  it("inserts after a given index", () => {
    expect(ids(insertPages(mk(3), extra, 1))).toEqual([
      "p0",
      "p1",
      "x0",
      "p2",
    ]);
  });
});

describe("splitIntoRanges", () => {
  it("splits at valid boundaries", () => {
    const chunks = splitIntoRanges(mk(5), [2, 4]);
    expect(chunks.map(ids)).toEqual([
      ["p0", "p1"],
      ["p2", "p3"],
      ["p4"],
    ]);
  });
  it("ignores out-of-range and duplicate boundaries", () => {
    const chunks = splitIntoRanges(mk(3), [0, 1, 1, 9]);
    expect(chunks.map(ids)).toEqual([["p0"], ["p1", "p2"]]);
  });
  it("returns one chunk when no valid boundary", () => {
    expect(splitIntoRanges(mk(3), []).map(ids)).toEqual([
      ["p0", "p1", "p2"],
    ]);
  });
});
