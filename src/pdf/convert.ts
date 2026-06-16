import type { PDFDocumentProxy } from "pdfjs-dist";

// docx and exceljs are large and only needed on demand, so they are loaded
// lazily (dynamic import) to keep them out of the initial bundle.

/**
 * Browser-only PDF -> Word / Excel conversion.
 *
 * These extract the PDF's TEXT LAYER using PDF.js and re-emit it. They are
 * NOT lossless and cannot recover layout, fonts, images, or vector graphics.
 * Scanned/image-only PDFs (no text layer) yield little or nothing — there is
 * no OCR. See the README for the full list of limitations.
 */

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

async function extractPageItems(
  doc: PDFDocumentProxy,
  pageNumber: number,
): Promise<TextItem[]> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const items: TextItem[] = [];
  for (const it of content.items) {
    // Type guard for TextItem (vs marked-content items).
    if (typeof (it as { str?: unknown }).str !== "string") continue;
    const t = it as { str: string; transform: number[]; width: number };
    items.push({
      str: t.str,
      x: t.transform[4],
      y: t.transform[5],
      width: t.width,
    });
  }
  return items;
}

/** Group text items into visual lines by their y coordinate. */
function groupIntoLines(items: TextItem[], yTolerance = 3): TextItem[][] {
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - item.y) <= yTolerance) {
      last.push(item);
    } else {
      lines.push([item]);
    }
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

function lineText(line: TextItem[]): string {
  return line
    .map((i) => i.str)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** Convert each PDF page's text layer into a .docx document. */
export async function pdfToDocx(doc: PDFDocumentProxy): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import(
    "docx"
  );
  const children: InstanceType<typeof Paragraph>[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: `Page ${p}`, bold: true })],
      }),
    );
    const items = await extractPageItems(doc, p);
    const lines = groupIntoLines(items);
    if (lines.length === 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "(No extractable text on this page.)",
              italics: true,
            }),
          ],
        }),
      );
    }
    for (const line of lines) {
      const text = lineText(line);
      if (text) children.push(new Paragraph({ children: [new TextRun(text)] }));
    }
  }

  const out = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(out);
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Convert the PDF text layer into a .xlsx workbook, one sheet per page.
 * Columns are inferred by clustering item x-positions — crude but useful for
 * PDFs that are genuinely tabular. Free-form prose will land in column A.
 */
export async function pdfToXlsx(doc: PDFDocumentProxy): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  for (let p = 1; p <= doc.numPages; p++) {
    const sheet = wb.addWorksheet(`Page ${p}`);
    const items = await extractPageItems(doc, p);
    const lines = groupIntoLines(items);

    // Infer column boundaries from the x positions seen across all lines.
    const xs = items.map((i) => i.x).sort((a, b) => a - b);
    const columns = inferColumns(xs);

    for (const line of lines) {
      const row: string[] = new Array(Math.max(columns.length, 1)).fill("");
      for (const item of line) {
        const col = columnIndex(columns, item.x);
        row[col] = (row[col] ? row[col] + " " : "") + item.str;
      }
      if (row.some((c) => c.trim() !== "")) sheet.addRow(row);
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/** Cluster sorted x positions into column anchors with a gap threshold. */
function inferColumns(sortedXs: number[], gap = 40): number[] {
  const cols: number[] = [];
  for (const x of sortedXs) {
    if (cols.length === 0 || x - cols[cols.length - 1] > gap) cols.push(x);
  }
  return cols;
}

function columnIndex(columns: number[], x: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < columns.length; i++) {
    const d = Math.abs(columns[i] - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
