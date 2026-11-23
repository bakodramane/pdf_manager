import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Borders, Cell, Font, Worksheet } from "exceljs";
import { extractPage } from "./extract";
import {
  analyzePage,
  chunksText,
  dominantStyle,
  lineText,
  needsSpace,
  paragraphText,
  parseNumber,
  type PageImage,
  type PageLayout,
  type Paragraph,
  type Table,
  type TextChunk,
} from "./layout";

/**
 * Browser-only PDF -> Word / Excel conversion.
 *
 * Each page goes through layout analysis (see layout.ts): text is grouped into
 * lines and paragraphs with their fonts, sizes, bold/italic, alignment and
 * indentation; tables are rebuilt from the PDF's ruling lines (bordered
 * tables) or from column alignment (borderless tables); images are re-embedded
 * in Word output.
 *
 * Limits: no OCR (scanned pages come through as images only), text colour and
 * vector drawings/charts are not reproduced, and complex layouts are
 * approximated. docx and exceljs are large, so they are loaded on demand.
 */

export type ProgressFn = (done: number, total: number) => void;

async function analyzeDocument(
  doc: PDFDocumentProxy,
  images: boolean,
  onProgress?: ProgressFn,
): Promise<PageLayout[]> {
  const out: PageLayout[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    try {
      out.push(analyzePage(await extractPage(page, { images })));
    } finally {
      page.cleanup();
    }
    onProgress?.(p, doc.numPages);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------

const twip = (pt: number) => Math.round(pt * 20);
const halfPt = (pt: number) => Math.max(2, Math.round(pt * 2));
const px = (pt: number) => Math.round((pt * 96) / 72);

type Docx = typeof import("docx");

/** A run of text with one style, before conversion to docx TextRuns. */
interface Piece {
  text: string;
  tab?: boolean;
  c: TextChunk;
  sup: boolean;
}

function paragraphPieces(p: Paragraph): Piece[] {
  const pieces: Piece[] = [];
  p.lines.forEach((line, li) => {
    line.chunks.forEach((c, ci) => {
      let text = c.str.replace(/\s+/g, " ");
      let tab = false;
      if (ci === 0 && li > 0) {
        const prev = pieces[pieces.length - 1];
        // De-hyphenate words split across lines.
        if (prev && /[A-Za-zÀ-ÿ]-$/.test(prev.text) && /^[a-zà-ÿ]/.test(text.trimStart())) {
          prev.text = prev.text.slice(0, -1);
          text = text.trimStart();
        } else if (prev && !/\s$/.test(prev.text)) {
          text = " " + text.trimStart();
        }
      } else if (ci > 0) {
        const prevC = line.chunks[ci - 1];
        const gap = c.x - (prevC.x + prevC.width);
        if (gap > c.size * 2.5) tab = true;
        else if (needsSpace(prevC, c)) text = " " + text;
      }
      const sup = c.size < line.size * 0.8 && c.y < line.y - line.size * 0.15;
      pieces.push({ text, tab, c, sup });
    });
  });
  if (pieces.length) {
    pieces[0].text = pieces[0].text.trimStart();
    const last = pieces[pieces.length - 1];
    last.text = last.text.trimEnd();
  }
  return pieces;
}

function docxRuns(D: Docx, p: Paragraph) {
  const runs: InstanceType<Docx["TextRun"]>[] = [];
  let buf: Piece | null = null;
  const key = (x: Piece) =>
    `${x.c.font}|${Math.round(x.c.size * 2)}|${x.c.bold}|${x.c.italic}|${x.sup}`;
  const flush = () => {
    if (!buf || !buf.text) return;
    runs.push(
      new D.TextRun({
        text: buf.text,
        font: buf.c.font,
        size: halfPt(buf.c.size),
        bold: buf.c.bold,
        italics: buf.c.italic,
        superScript: buf.sup || undefined,
        color: "000000",
      }),
    );
  };
  for (const piece of paragraphPieces(p)) {
    if (piece.tab) {
      flush();
      buf = null;
      runs.push(new D.TextRun({ children: [new D.Tab()] }));
    }
    if (buf && key(buf) === key(piece)) {
      buf.text += piece.text;
    } else {
      flush();
      buf = { ...piece };
    }
  }
  flush();
  return runs;
}

function docxParagraph(
  D: Docx,
  p: Paragraph,
  spaceBefore: number,
  inTable = false,
) {
  const align = {
    left: D.AlignmentType.LEFT,
    center: D.AlignmentType.CENTER,
    right: D.AlignmentType.RIGHT,
    justify: D.AlignmentType.JUSTIFIED,
  }[p.align];
  const heading =
    !inTable && p.heading
      ? [D.HeadingLevel.HEADING_1, D.HeadingLevel.HEADING_2, D.HeadingLevel.HEADING_3][
          p.heading - 1
        ]
      : undefined;
  const indent = inTable
    ? undefined
    : {
        left: twip(p.indent),
        firstLine: p.firstLine > 1 ? twip(p.firstLine) : undefined,
        hanging: p.firstLine < -1 ? twip(Math.min(-p.firstLine, p.indent)) : undefined,
      };
  return new D.Paragraph({
    children: docxRuns(D, p),
    heading,
    alignment: align,
    indent,
    spacing: {
      before: twip(Math.max(0, spaceBefore)),
      after: 0,
      line: Math.round(Math.min(720, Math.max(220, (240 * p.lineRatio) / 1.17))),
      lineRule: D.LineRuleType.AUTO,
    },
  });
}

function docxTable(D: Docx, t: Table, marginLeft: number, contentW: number) {
  const nRows = t.rowEdges.length - 1;
  const raw = t.colEdges.slice(1).map((e, i) => e - t.colEdges[i]);
  const total = raw.reduce((a, b) => a + b, 0);
  const scale = total > contentW ? contentW / total : 1;
  const widths = raw.map((w) => Math.max(200, twip(w * scale)));

  const line = { style: D.BorderStyle.SINGLE, size: 4, color: "000000" };
  const none = { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const b = t.kind === "ruled" ? line : none;

  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const cells = t.cells
      .filter((c) => c.row === r)
      .sort((a, b2) => a.col - b2.col)
      .map((c) => {
        const width = widths.slice(c.col, c.col + c.colSpan).reduce((a, x) => a + x, 0);
        const children = c.paragraphs.map((p, i) =>
          docxParagraph(
            D,
            p,
            i === 0 ? 0 : p.top - c.paragraphs[i - 1].bottom,
            true,
          ),
        );
        return new D.TableCell({
          children: children.length ? children : [new D.Paragraph("")],
          columnSpan: c.colSpan > 1 ? c.colSpan : undefined,
          rowSpan: c.rowSpan > 1 ? c.rowSpan : undefined,
          width: { size: width, type: D.WidthType.DXA },
          shading: c.fill
            ? { fill: c.fill, type: D.ShadingType.CLEAR, color: "auto" }
            : undefined,
          margins: { top: 20, bottom: 20, left: 60, right: 60 },
          verticalAlign: D.VerticalAlign.TOP,
        });
      });
    const header =
      r === 0 &&
      cells.length > 0 &&
      t.cells
        .filter((c) => c.row === 0 && c.paragraphs.length)
        .every((c) => c.paragraphs.every((p) => p.bold));
    rows.push(new D.TableRow({ children: cells, tableHeader: header || undefined, cantSplit: true }));
  }

  const indent = t.x0 - marginLeft;
  return new D.Table({
    rows,
    columnWidths: widths,
    width: { size: widths.reduce((a, x) => a + x, 0), type: D.WidthType.DXA },
    layout: D.TableLayoutType.FIXED,
    indent: indent > 2 ? { size: twip(indent), type: D.WidthType.DXA } : undefined,
    borders: {
      top: b,
      bottom: b,
      left: b,
      right: b,
      insideHorizontal: b,
      insideVertical: b,
    },
  });
}

function docxImage(
  D: Docx,
  img: PageImage,
  spaceBefore: number,
  marginLeft: number,
  contentW: number,
  contentH: number,
) {
  let w = img.x1 - img.x0;
  let h = img.y1 - img.y0;
  const s = Math.min(1, contentW / w, (contentH * 0.98) / h);
  w *= s;
  h *= s;
  const left = Math.max(0, Math.min(img.x0 - marginLeft, contentW - w));
  return new D.Paragraph({
    spacing: { before: twip(Math.max(0, spaceBefore)), after: 0 },
    indent: { left: twip(left) },
    children: [
      new D.ImageRun({
        type: img.format,
        data: img.data,
        transformation: { width: px(w), height: px(h) },
      }),
    ],
  });
}

/** Convert the PDF into a .docx that mirrors each page's layout. */
export async function pdfToDocx(
  doc: PDFDocumentProxy,
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  const D = await import("docx");
  const layouts = await analyzeDocument(doc, true, onProgress);

  // Document-wide default font = the most common body font.
  const fontCount = new Map<string, number>();
  for (const L of layouts) {
    for (const b of L.blocks) {
      if (b.type !== "paragraph") continue;
      const st = dominantStyle(b.p.lines.flatMap((l) => l.chunks));
      fontCount.set(st.font, (fontCount.get(st.font) ?? 0) + 1);
    }
  }
  const defaultFont =
    [...fontCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Calibri";
  const defaultSize = layouts[0]?.bodySize ?? 11;

  const sections = layouts.map((L) => {
    const m = L.margins;
    const contentW = L.width - m.left - m.right;
    const contentH = L.height - m.top - m.bottom;
    const children: (InstanceType<Docx["Paragraph"]> | InstanceType<Docx["Table"]>)[] = [];
    let prevBottom = m.top;
    // Slightly compress vertical gaps so Word's line metrics don't push the
    // last lines of a page onto an extra page.
    const gap = (top: number) => Math.min(144, Math.max(0, (top - prevBottom) * 0.85));

    for (const b of L.blocks) {
      if (b.type === "paragraph") {
        children.push(docxParagraph(D, b.p, gap(b.top)));
      } else if (b.type === "table") {
        const before = gap(b.top);
        if (before > 4) {
          children.push(
            new D.Paragraph({ spacing: { before: 0, after: 0, line: twip(before), lineRule: D.LineRuleType.EXACT }, children: [] }),
          );
        }
        children.push(docxTable(D, b.t, m.left, contentW));
      } else {
        children.push(docxImage(D, b.img, gap(b.top), m.left, contentW, contentH));
      }
      prevBottom = Math.max(prevBottom, b.bottom);
    }
    // Word needs a paragraph after a table and in empty sections.
    if (!children.length || !(children[children.length - 1] instanceof D.Paragraph)) {
      children.push(new D.Paragraph({ spacing: { before: 0, after: 0 }, children: [] }));
    }

    const landscape = L.width > L.height;
    return {
      properties: {
        page: {
          size: {
            width: twip(landscape ? L.height : L.width),
            height: twip(landscape ? L.width : L.height),
            orientation: landscape
              ? D.PageOrientation.LANDSCAPE
              : D.PageOrientation.PORTRAIT,
          },
          margin: {
            top: twip(m.top),
            bottom: twip(m.bottom),
            left: twip(m.left),
            right: twip(m.right),
            header: twip(Math.min(18, m.top)),
            footer: twip(Math.min(18, m.bottom)),
          },
        },
      },
      children,
    };
  });

  const out = new D.Document({
    creator: "PDF Manager",
    styles: {
      default: {
        document: { run: { font: defaultFont, size: halfPt(defaultSize) } },
      },
    },
    sections: sections.length ? sections : [{ children: [new D.Paragraph("")] }],
  });
  const blob = await D.Packer.toBlob(out);
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

function excelFont(chunks: TextChunk[]): Partial<Font> {
  const st = dominantStyle(chunks);
  return {
    name: st.font || "Calibri",
    size: Math.round(st.size * 2) / 2,
    bold: st.bold || undefined,
    italic: st.italic || undefined,
  };
}

const THIN = { style: "thin" as const, color: { argb: "FF000000" } };

function writeTable(
  ws: Worksheet,
  t: Table,
  startRow: number,
  colChars: number[],
): number {
  const nRows = t.rowEdges.length - 1;
  const ruled = t.kind === "ruled";
  const firstRowBold = t.cells
    .filter((c) => c.row === 0 && c.paragraphs.length)
    .every((c) => c.paragraphs.every((p) => p.bold));

  for (const c of t.cells) {
    const r = startRow + c.row;
    const col = 1 + c.col;
    const cell: Cell = ws.getCell(r, col);
    const chunks = c.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.chunks));
    const text = c.paragraphs.map(paragraphText).join("\n").trim();
    const num = text && !text.includes("\n") ? parseNumber(text) : null;

    if (num) {
      cell.value = num.value;
      if (num.numFmt) cell.numFmt = num.numFmt;
    } else if (text) {
      cell.value = text;
    }
    if (chunks.length) cell.font = excelFont(chunks);

    const align = c.paragraphs[0]?.align;
    cell.alignment = {
      vertical: "top",
      wrapText: text.includes("\n") || undefined,
      horizontal: num
        ? "right"
        : align === "center"
          ? "center"
          : align === "right"
            ? "right"
            : undefined,
    };
    if (c.fill) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + c.fill } };
    }

    // Borders must be set on every grid cell a merged cell covers.
    const border: Partial<Borders> | undefined = ruled
      ? { top: THIN, left: THIN, bottom: THIN, right: THIN }
      : c.row === 0 && firstRowBold && nRows > 1
        ? { bottom: THIN }
        : undefined;
    if (border) {
      for (let rr = r; rr < r + c.rowSpan; rr++) {
        for (let cc = col; cc < col + c.colSpan; cc++) ws.getCell(rr, cc).border = border;
      }
    }
    if (c.rowSpan > 1 || c.colSpan > 1) {
      ws.mergeCells(r, col, r + c.rowSpan - 1, col + c.colSpan - 1);
    }

    const longest = Math.max(0, ...text.split("\n").map((s) => s.length));
    const perCol = Math.ceil(longest / c.colSpan);
    for (let k = c.col; k < c.col + c.colSpan; k++) {
      colChars[k] = Math.max(colChars[k] ?? 0, Math.min(perCol, 60));
    }
  }
  return startRow + nRows;
}

/**
 * Convert the PDF into a .xlsx workbook, one sheet per page. Detected tables
 * become real cell grids (merged cells, borders, shading, numbers parsed as
 * numbers); other text is written one line per row.
 */
export async function pdfToXlsx(
  doc: PDFDocumentProxy,
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const layouts = await analyzeDocument(doc, false, onProgress);
  const wb = new ExcelJS.Workbook();
  wb.creator = "PDF Manager";

  layouts.forEach((L, i) => {
    const ws = wb.addWorksheet(`Page ${i + 1}`, {
      pageSetup: {
        orientation: L.width > L.height ? "landscape" : "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });
    const colChars: number[] = [];
    let row = 1;
    let prevBottom: number | null = null;

    for (const b of L.blocks) {
      if (b.type === "image") continue;
      if (prevBottom !== null && b.top - prevBottom > L.bodySize * 1.2) row++;
      if (b.type === "paragraph") {
        for (const line of b.p.lines) {
          // Keep wide-gap segments ("Date:      12/01/2024") in separate cells.
          line.segments.forEach((seg, si) => {
            const cell = ws.getCell(row, si + 1);
            cell.value = chunksText(seg);
            cell.font = excelFont(seg);
            if (si > 0) {
              colChars[si] = Math.max(colChars[si] ?? 0, Math.min(chunksText(seg).length, 60));
            }
          });
          if (!line.segments.length) ws.getCell(row, 1).value = lineText(line);
          row++;
        }
      } else {
        row = writeTable(ws, b.t, row, colChars);
      }
      prevBottom = b.bottom;
    }

    for (let c = 0; c < Math.max(colChars.length, 1); c++) {
      const chars = colChars[c] ?? 0;
      ws.getColumn(c + 1).width = Math.min(60, Math.max(10, chars * 1.1 + 2));
    }
  });

  if (layouts.length === 0) wb.addWorksheet("Page 1");
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
