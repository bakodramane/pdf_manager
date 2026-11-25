// @vitest-environment node
import { describe, expect, it, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { extractPage } from "./extract";
import { analyzePage, paragraphText } from "./layout";
import { pdfToDocx, pdfToXlsx } from "./convert";

/**
 * End-to-end: build a real PDF with pdf-lib, read it with PDF.js, and check
 * the layout analysis and the generated .docx / .xlsx.
 */

beforeAll(() => {
  const require = createRequire(import.meta.url);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve("pdfjs-dist/build/pdf.worker.mjs"),
  ).href;
});

async function samplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  const H = 792;
  const text = (s: string, x: number, top: number, size = 11, font = regular) =>
    page.drawText(s, { x, y: H - top, size, font, color: rgb(0, 0, 0) });

  text("Quarterly Report", 72, 80, 22, bold);
  text("This report summarises the results of the quarter. The figures below", 72, 120);
  text("are unaudited and are provided for information purposes only, and", 72, 134);
  text("should be read together with the notes.", 72, 148);

  // Bordered table: 3 columns x 4 rows, header shaded.
  const xs = [72, 252, 382, 540];
  const ys = [180, 200, 220, 240, 260];
  page.drawRectangle({ x: 72, y: H - 200, width: 468, height: 20, color: rgb(0.85, 0.85, 0.85) });
  for (const y of ys) page.drawLine({ start: { x: 72, y: H - y }, end: { x: 540, y: H - y }, thickness: 0.75 });
  for (const x of xs) page.drawLine({ start: { x, y: H - 180 }, end: { x, y: H - 260 }, thickness: 0.75 });
  const rows = [
    ["Region", "Units", "Revenue"],
    ["North", "1,204", "$12,040.50"],
    ["South", "980", "$9,800.00"],
    ["West", "(15)", "-3.5%"],
  ];
  rows.forEach((r, i) =>
    r.forEach((v, j) => text(v, xs[j] + 6, ys[i] + 14, 10, i === 0 ? bold : regular)),
  );

  // Borderless table.
  text("Name", 72, 300, 10, bold);
  text("Role", 240, 300, 10, bold);
  text("Start date", 420, 300, 10, bold);
  const people = [
    ["Alice Martin", "Engineer", "2021-03-01"],
    ["Bob Diallo", "Designer", "2022-07-15"],
    ["Chloé Traoré", "Manager", "2019-11-30"],
  ];
  people.forEach((p, i) => {
    text(p[0], 72, 316 + i * 16, 10);
    text(p[1], 240, 316 + i * 16, 10);
    text(p[2], 420, 316 + i * 16, 10);
  });

  text("End of report.", 72, 420);
  return doc.save();
}

const tasks: ReturnType<typeof pdfjs.getDocument>[] = [];
async function open(bytes: Uint8Array) {
  const task = pdfjs.getDocument({ data: bytes.slice() });
  tasks.push(task);
  return task.promise;
}
afterAll(async () => {
  await Promise.all(tasks.map((t) => t.destroy()));
});

describe("PDF conversion (end to end)", () => {
  it("analyzes headings, paragraphs and both kinds of tables", async () => {
    const pdf = await open(await samplePdf());
    const layout = analyzePage(await extractPage(await pdf.getPage(1), { images: false }));
    const types = layout.blocks.map((b) => b.type);
    expect(types).toEqual(["paragraph", "paragraph", "table", "table", "paragraph"]);

    const [title, body, ruled, aligned] = layout.blocks;
    if (title.type !== "paragraph" || body.type !== "paragraph") throw new Error();
    expect(title.p.heading).toBe(1);
    expect(title.p.bold).toBe(true);
    expect(title.p.lines[0].chunks[0].font).toBe("Arial");
    expect(body.p.lines).toHaveLength(3);
    expect(paragraphText(body.p)).toMatch(/^This report .* notes\.$/);

    if (ruled.type !== "table" || aligned.type !== "table") throw new Error();
    expect(ruled.t.kind).toBe("ruled");
    expect(ruled.t.colEdges).toHaveLength(4);
    expect(ruled.t.rowEdges).toHaveLength(5);
    expect(ruled.t.cells.find((c) => c.row === 0 && c.col === 0)?.fill).toBe("D9D9D9");
    expect(aligned.t.kind).toBe("aligned");
    expect(aligned.t.colEdges).toHaveLength(4);
    expect(aligned.t.rowEdges).toHaveLength(5);
  });

  it("writes a .docx with real tables, fonts and page setup", async () => {
    const pdf = await open(await samplePdf());
    const progress: number[] = [];
    const bytes = await pdfToDocx(pdf, (d) => progress.push(d));
    expect(progress).toEqual([1]);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml.match(/<w:tbl>/g)).toHaveLength(2);
    expect(xml).toContain("Quarterly Report");
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('w:ascii="Arial"');
    expect(xml).toContain('w:fill="D9D9D9"');
    expect(xml).toContain('w:w="12240"'); // 8.5in page width
    expect(xml).not.toContain("Page 1"); // no synthetic page headings any more
  });

  it("writes a .xlsx with table cells and parsed numbers", async () => {
    const pdf = await open(await samplePdf());
    const bytes = await pdfToXlsx(pdf);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    const ws = wb.getWorksheet("Page 1")!;
    const values: unknown[][] = [];
    const rowNumbers: number[] = [];
    ws.eachRow((row, n) => {
      values.push((row.values as unknown[]).slice(1));
      rowNumbers.push(n);
    });
    const flat = values.map((r) => r.map((v) => (v === undefined || v === null ? "" : v)));

    const north = flat.find((r) => r[0] === "North");
    expect(north).toEqual(["North", 1204, 12040.5]);
    const west = flat.find((r) => r[0] === "West");
    expect(west).toEqual(["West", -15, -0.035]);
    expect(flat.find((r) => r[0] === "Bob Diallo")).toEqual(["Bob Diallo", "Designer", "2022-07-15"]);

    // Number formats and styling survive.
    const northRow = rowNumbers[values.findIndex((r) => r[0] === "North")];
    expect(ws.getCell(northRow, 3).numFmt).toBe('"$"#,##0.00');
    expect(ws.getCell(northRow, 1).border?.top?.style).toBe("thin");
  });
});

describe("Excel export safety", () => {
  it("writes formula-like PDF text as literal strings, never as formulas", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    const hostile = ["=HYPERLINK(\"http://example.com\",\"x\")", "+SUM(1,2)", "-2+3", "@cmd", "=1+1"];
    hostile.forEach((t, i) => page.drawText(t, { x: 72, y: 760 - i * 20, size: 11, font }));
    const pdf = await open(await doc.save());
    const bytes = await pdfToXlsx(pdf);
    // No <f> (formula) element anywhere in the workbook XML.
    const zip = await JSZip.loadAsync(bytes);
    const sheetXml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(sheetXml).not.toMatch(/<f[ >]/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    const cells: unknown[] = [];
    wb.getWorksheet("Page 1")!.eachRow((row) => row.eachCell((c) => cells.push(c.value)));
    for (const v of cells) expect(typeof v === "object" && v !== null && "formula" in v).toBe(false);
    expect(cells.map(String).join(" ")).toContain("=HYPERLINK");
  });
});
