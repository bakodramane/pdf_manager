import { describe, expect, it } from "vitest";
import {
  analyzePage,
  buildAlignedTable,
  buildLines,
  describeFont,
  findGutter,
  lineText,
  paragraphText,
  parseNumber,
  type PageContent,
  type TextChunk,
} from "./layout";

const CHAR_W = 0.5; // em per character for synthetic text

function chunk(str: string, x: number, y: number, size = 10, extra: Partial<TextChunk> = {}): TextChunk {
  return {
    str,
    x,
    y,
    width: str.length * size * CHAR_W,
    size,
    font: "Arial",
    bold: false,
    italic: false,
    ...extra,
  };
}

function page(chunks: TextChunk[], extra: Partial<PageContent> = {}): PageContent {
  return {
    width: 612,
    height: 792,
    chunks,
    hLines: [],
    vLines: [],
    fills: [],
    images: [],
    ...extra,
  };
}

describe("describeFont", () => {
  it("strips subset prefixes and detects style", () => {
    expect(describeFont("ABCDEF+TimesNewRomanPS-BoldItalicMT")).toEqual({
      font: "Times New Roman",
      bold: true,
      italic: true,
    });
    expect(describeFont("Helvetica-Oblique")).toEqual({ font: "Arial", bold: false, italic: true });
    expect(describeFont("OpenSans-SemiBold").font).toBe("Open Sans");
    expect(describeFont("", "serif").font).toBe("Times New Roman");
  });
});

describe("parseNumber", () => {
  it.each([
    ["1,234.56", 1234.56, "#,##0.00"],
    ["(1,234)", -1234, "#,##0;(#,##0)"],
    ["12.5%", 0.125, "0.0%"],
    ["$1,200.00", 1200, '"$"#,##0.00'],
    ["1 234,56", 1234.56, "#,##0.00"],
    ["1.234.567", 1234567, "#,##0"],
    ["-42", -42, undefined],
    ["3,5", 3.5, "0.0"],
  ])("parses %s", (raw, value, fmt) => {
    const r = parseNumber(raw);
    expect(r?.value).toBeCloseTo(value as number, 6);
    expect(r?.numFmt).toBe(fmt);
  });

  it.each(["00123", "12/05/2024", "abc", "555 1234", "1234567890123456789", ""])(
    "keeps %s as text",
    (raw) => {
      expect(parseNumber(raw)).toBeNull();
    },
  );
});

describe("buildLines", () => {
  it("groups by baseline and infers spaces from gaps", () => {
    const lines = buildLines([
      chunk("World", 40, 100),
      chunk("Hello", 10, 100.5),
      chunk("Next", 10, 115),
    ]);
    expect(lines).toHaveLength(2);
    expect(lineText(lines[0])).toBe("Hello World");
    expect(lineText(lines[1])).toBe("Next");
  });

  it("joins per-character chunks without spurious spaces", () => {
    const chars = "Tight".split("").map((ch, i) => chunk(ch, 10 + i * 5, 50));
    expect(lineText(buildLines(chars)[0])).toBe("Tight");
  });

  it("splits a line into segments at wide gaps", () => {
    const [line] = buildLines([chunk("Name", 10, 50), chunk("Value", 200, 50)]);
    expect(line.segments).toHaveLength(2);
  });
});

describe("paragraphs", () => {
  it("merges wrapped lines and de-hyphenates", () => {
    const body = [
      "This is a long paragraph line that reaches the right edge of",
      "the text column and keeps going with some more inter-",
      "esting words until it finally ends.",
    ];
    // Make all but the last line reach the same right edge.
    const chunks = body.map((t, i) => {
      const c = chunk(t, 72, 100 + i * 12);
      if (i < 2) c.width = 400;
      return c;
    });
    const layout = analyzePage(page([chunk("Title", 72, 70, 20, { bold: true }), ...chunks]));
    const paras = layout.blocks.filter((b) => b.type === "paragraph");
    expect(paras).toHaveLength(2);
    if (paras[0].type !== "paragraph" || paras[1].type !== "paragraph") throw new Error();
    expect(paras[0].p.heading).toBe(1);
    expect(paragraphText(paras[1].p)).toContain("interesting words");
    expect(paras[1].p.lines).toHaveLength(3);
  });

  it("keeps short stacked lines (addresses) as separate paragraphs", () => {
    const long = (t: string, y: number) => ({ ...chunk(t, 72, y), width: 468 });
    const layout = analyzePage(
      page([
        chunk("Jane Doe", 72, 100),
        chunk("12 Main Street", 72, 112),
        chunk("Springfield", 72, 124),
        long("Dear Jane, thank you for your letter about the recent changes to the", 136),
        long("service. We have reviewed it carefully and are pleased to confirm the", 148),
        chunk("new terms.", 72, 160),
      ]),
    );
    const texts = layout.blocks.map((b) => (b.type === "paragraph" ? paragraphText(b.p) : ""));
    expect(texts.slice(0, 3)).toEqual(["Jane Doe", "12 Main Street", "Springfield"]);
    expect(texts[3]).toMatch(/^Dear Jane.*new terms\.$/);
  });

  it("detects centered text", () => {
    const layout = analyzePage(
      page([
        chunk("A centered caption", 250, 100),
        chunk("Left aligned body text that spans the full width of the page", 72, 130, 10, {
          width: 468,
        }),
      ]),
    );
    const first = layout.blocks[0];
    expect(first.type === "paragraph" && first.p.align).toBe("center");
  });
});

describe("borderless tables", () => {
  const rows = [
    ["Item", "Qty", "Price"],
    ["Apples", "3", "1.20"],
    ["Bananas", "12", "0.50"],
    ["Cherries", "100", "12.00"],
  ];
  const chunks = rows.flatMap((r, i) => [
    chunk(r[0], 72, 100 + i * 14, 10, { bold: i === 0 }),
    chunk(r[1], 250, 100 + i * 14, 10, { bold: i === 0 }),
    chunk(r[2], 400, 100 + i * 14, 10, { bold: i === 0 }),
  ]);

  it("recovers columns from whitespace", () => {
    const t = buildAlignedTable(buildLines(chunks));
    expect(t).not.toBeNull();
    expect(t!.colEdges).toHaveLength(4);
    expect(t!.rowEdges).toHaveLength(5);
    const cell = t!.cells.find((c) => c.row === 2 && c.col === 1);
    expect(paragraphText(cell!.paragraphs[0])).toBe("12");
  });

  it("does not treat two prose columns as a table", () => {
    const left = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed";
    const right = "Ut enim ad minim veniam quis nostrud exercitation ullamco";
    const lines = buildLines(
      [0, 1, 2].flatMap((i) => [chunk(left, 72, 100 + i * 12), chunk(right, 340, 100 + i * 12)]),
    );
    expect(buildAlignedTable(lines)).toBeNull();
  });

  it("is emitted as a table block by analyzePage", () => {
    const layout = analyzePage(page(chunks));
    expect(layout.blocks.map((b) => b.type)).toEqual(["table"]);
  });
});

describe("ruled tables", () => {
  it("builds a grid from ruling lines and detects merged cells", () => {
    // 3 columns x 3 rows; the first row's middle rule is missing (colspan 2).
    const xs = [72, 200, 330, 460];
    const ys = [100, 120, 140, 160];
    const hLines = ys.map((y) => ({ x0: xs[0], x1: xs[3], y0: y, y1: y }));
    const vLines = [
      { x0: 72, x1: 72, y0: 100, y1: 160 },
      { x0: 200, x1: 200, y0: 120, y1: 160 }, // not in row 0
      { x0: 330, x1: 330, y0: 100, y1: 160 },
      { x0: 460, x1: 460, y0: 100, y1: 160 },
    ];
    const chunks = [
      chunk("Merged header", 80, 114),
      chunk("H3", 340, 114),
      chunk("a", 80, 134),
      chunk("b", 210, 134),
      chunk("c", 340, 134),
      chunk("d", 80, 154),
      chunk("e", 210, 154),
      chunk("f", 340, 154),
    ];
    const fills = [{ x0: 72, x1: 460, y0: 100, y1: 120, color: "D9D9D9" }];
    const layout = analyzePage(page(chunks, { hLines, vLines, fills }));
    expect(layout.blocks).toHaveLength(1);
    const b = layout.blocks[0];
    if (b.type !== "table") throw new Error("expected table");
    expect(b.t.kind).toBe("ruled");
    const head = b.t.cells.find((c) => c.row === 0 && c.col === 0)!;
    expect(head.colSpan).toBe(2);
    expect(head.fill).toBe("D9D9D9");
    expect(b.t.cells).toHaveLength(8);
    const e = b.t.cells.find((c) => c.row === 2 && c.col === 1)!;
    expect(paragraphText(e.paragraphs[0])).toBe("e");
  });
});

describe("two-column pages", () => {
  it("reads the left column before the right one", () => {
    const chunks: TextChunk[] = [];
    for (let i = 0; i < 10; i++) {
      chunks.push(chunk(`Left column sentence number ${i} goes here`, 72, 100 + i * 12, 10, { width: 220 }));
      chunks.push(chunk(`Right column sentence number ${i} goes here`, 320, 100 + i * 12, 10, { width: 220 }));
    }
    const lines = buildLines(chunks);
    expect(findGutter(lines)).not.toBeNull();
    const layout = analyzePage(page(chunks));
    const texts = layout.blocks
      .filter((b) => b.type === "paragraph")
      .map((b) => (b.type === "paragraph" ? paragraphText(b.p) : ""));
    const all = texts.join(" ");
    expect(all.indexOf("Left column sentence number 9")).toBeLessThan(
      all.indexOf("Right column sentence number 0"),
    );
    expect(layout.blocks.some((b) => b.type === "table")).toBe(false);
  });
});
