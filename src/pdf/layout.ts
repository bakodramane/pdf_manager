/**
 * Page layout analysis for PDF -> Word / Excel conversion.
 *
 * This module is pure (no PDF.js / DOM dependencies) so it can be unit tested
 * with synthetic input. `extract.ts` turns a PDF.js page into a PageContent;
 * `analyzePage` turns that into an ordered list of blocks (paragraphs, tables,
 * images) that the Word and Excel writers render.
 *
 * Coordinates are in PDF points in "display space": origin at the top-left of
 * the (rotated) page, y growing downwards. Text `y` is the baseline.
 */

// ---------------------------------------------------------------------------
// Input model
// ---------------------------------------------------------------------------

export interface TextChunk {
  str: string;
  /** Left edge. */
  x: number;
  /** Baseline. */
  y: number;
  width: number;
  /** Font size in points. */
  size: number;
  /** Cleaned font family name, e.g. "Times New Roman". */
  font: string;
  bold: boolean;
  italic: boolean;
}

/** Axis-aligned ruling segment. Horizontal: y0 === y1. Vertical: x0 === x1. */
export interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FillRect extends Box {
  /** "RRGGBB" */
  color: string;
}

export interface PageImage extends Box {
  data: Uint8Array;
  format: "png" | "jpg";
}

export interface PageContent {
  width: number;
  height: number;
  chunks: TextChunk[];
  hLines: Seg[];
  vLines: Seg[];
  fills: FillRect[];
  images: PageImage[];
}

// ---------------------------------------------------------------------------
// Output model
// ---------------------------------------------------------------------------

export interface Line {
  chunks: TextChunk[];
  /** Chunks split wherever there is a wide horizontal gap. */
  segments: TextChunk[][];
  x0: number;
  x1: number;
  /** Baseline (of the dominant chunk). */
  y: number;
  /** Dominant font size. */
  size: number;
}

export type Align = "left" | "center" | "right" | "justify";

export interface Paragraph {
  lines: Line[];
  /** Horizontal extent of the column/cell the paragraph lives in. */
  regionX0: number;
  regionX1: number;
  align: Align;
  /** Left indent relative to regionX0, in points. */
  indent: number;
  /** First-line offset relative to `indent` (negative = hanging). */
  firstLine: number;
  /** Dominant style. */
  size: number;
  bold: boolean;
  /** 0 = body text, 1..3 = heading level. */
  heading: number;
  /** Baseline-to-baseline distance divided by font size (1.2 ≈ single). */
  lineRatio: number;
  top: number;
  bottom: number;
}

export interface TableCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  paragraphs: Paragraph[];
  /** "RRGGBB" background, if any. */
  fill?: string;
}

export interface Table {
  kind: "ruled" | "aligned";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  colEdges: number[];
  rowEdges: number[];
  /** Only "origin" cells; cells covered by a span are omitted. */
  cells: TableCell[];
}

export type Block =
  | { type: "paragraph"; top: number; bottom: number; p: Paragraph }
  | { type: "table"; top: number; bottom: number; t: Table }
  | { type: "image"; top: number; bottom: number; img: PageImage };

export interface PageLayout {
  width: number;
  height: number;
  margins: { left: number; right: number; top: number; bottom: number };
  bodySize: number;
  blocks: Block[];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const ASCENT = 0.9; // approx. top of glyphs above baseline, in em
const DESCENT = 0.25; // approx. bottom of glyphs below baseline, in em
/** Gap (in em) that splits a line into separate segments (columns/cells). */
const SEGMENT_GAP_EM = 0.9;
/** Gap (in em) above which a space is inserted between two chunks. */
const SPACE_GAP_EM = 0.12;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export const lineTop = (l: Line): number => l.y - l.size * ASCENT;
export const lineBottom = (l: Line): number => l.y + l.size * DESCENT;

function chunkRight(c: TextChunk): number {
  return c.x + c.width;
}

function textLength(chunks: TextChunk[]): number {
  let n = 0;
  for (const c of chunks) n += c.str.length;
  return n;
}

/** The style that covers the most characters. */
export function dominantStyle(chunks: TextChunk[]): {
  size: number;
  bold: boolean;
  italic: boolean;
  font: string;
} {
  const weights = new Map<string, number>();
  let best: TextChunk | undefined;
  let bestW = -1;
  for (const c of chunks) {
    const key = `${Math.round(c.size * 2)}|${c.bold}|${c.italic}|${c.font}`;
    const w = (weights.get(key) ?? 0) + c.str.trim().length + 0.01;
    weights.set(key, w);
    if (w > bestW) {
      bestW = w;
      best = c;
    }
  }
  return best
    ? { size: best.size, bold: best.bold, italic: best.italic, font: best.font }
    : { size: 11, bold: false, italic: false, font: "" };
}

/** True when a space should separate `prev` and `next` chunks on one line. */
export function needsSpace(prev: TextChunk, next: TextChunk): boolean {
  if (/\s$/.test(prev.str) || /^\s/.test(next.str)) return false;
  const gap = next.x - chunkRight(prev);
  return gap > Math.min(prev.size, next.size) * SPACE_GAP_EM;
}

/** Plain text of a run of chunks on one line, with inferred spaces. */
export function chunksText(chunks: TextChunk[]): string {
  let s = "";
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0 && needsSpace(chunks[i - 1], chunks[i])) s += " ";
    s += chunks[i].str;
  }
  return s.replace(/\s+/g, " ").trim();
}

export function lineText(line: Line): string {
  return chunksText(line.chunks);
}

// ---------------------------------------------------------------------------
// Font name cleanup
// ---------------------------------------------------------------------------

const KNOWN_FONTS: Record<string, string> = {
  arial: "Arial",
  arialmt: "Arial",
  arialnarrow: "Arial Narrow",
  helvetica: "Arial",
  helveticaneue: "Helvetica Neue",
  times: "Times New Roman",
  timesroman: "Times New Roman",
  timesnewroman: "Times New Roman",
  timesnewromanps: "Times New Roman",
  timesnewromanpsmt: "Times New Roman",
  courier: "Courier New",
  couriernew: "Courier New",
  couriernewpsmt: "Courier New",
  calibri: "Calibri",
  calibrilight: "Calibri Light",
  cambria: "Cambria",
  cambriamath: "Cambria Math",
  georgia: "Georgia",
  verdana: "Verdana",
  tahoma: "Tahoma",
  trebuchetms: "Trebuchet MS",
  segoeui: "Segoe UI",
  garamond: "Garamond",
  bookantiqua: "Book Antiqua",
  centurygothic: "Century Gothic",
  symbol: "Symbol",
  wingdings: "Wingdings",
  consolas: "Consolas",
  aptos: "Aptos",
  liberationsans: "Arial",
  liberationserif: "Times New Roman",
  liberationmono: "Courier New",
  dejavusans: "DejaVu Sans",
};

const GENERIC_FAMILIES: Record<string, string> = {
  serif: "Times New Roman",
  "sans-serif": "Arial",
  monospace: "Courier New",
};

/**
 * Turn a PDF base-font name ("ABCDEF+TimesNewRomanPS-BoldItalicMT") into a
 * family name Word/Excel understand plus bold/italic flags.
 */
export function describeFont(
  rawName: string | undefined,
  genericFamily?: string,
): { font: string; bold: boolean; italic: boolean } {
  let name = (rawName ?? "").replace(/^[A-Z]{6}\+/, "").trim();
  const bold = /bold|black|heavy|semibold|demibold|demi\b|extrabold/i.test(
    name,
  );
  const italic = /italic|oblique|[-,]it\b/i.test(name);
  // Drop the style part ("-BoldItalic", ",Bold") and vendor suffixes.
  name = name.split(/[-,]/)[0];
  name = name.replace(/(PSMT|PS|MT)$/, "");
  const key = name.toLowerCase().replace(/[^a-z]/g, "");
  if (KNOWN_FONTS[key]) return { font: KNOWN_FONTS[key], bold, italic };
  if (!name || /^(f\d+|t\d+|font\d*|g_d\d+_f\d+)$/i.test(name)) {
    const generic = GENERIC_FAMILIES[genericFamily ?? ""] ?? "Calibri";
    return { font: generic, bold, italic };
  }
  // "OpenSans" -> "Open Sans", "SegoeUI" -> "Segoe UI"
  const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return { font: spaced, bold, italic };
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

function makeLine(chunks: TextChunk[]): Line {
  chunks.sort((a, b) => a.x - b.x);
  const segments: TextChunk[][] = [];
  let current: TextChunk[] = [];
  let right = -Infinity;
  for (const c of chunks) {
    const size = Math.min(c.size, current[0]?.size ?? c.size);
    if (current.length && c.x - right > Math.max(size * SEGMENT_GAP_EM, 4)) {
      segments.push(current);
      current = [];
    }
    current.push(c);
    right = Math.max(right, chunkRight(c));
  }
  if (current.length) segments.push(current);

  let dom = chunks[0];
  for (const c of chunks) if (c.size > dom.size) dom = c;
  const style = dominantStyle(chunks);
  return {
    chunks,
    segments,
    x0: chunks[0].x,
    x1: Math.max(...chunks.map(chunkRight)),
    y: dom.y,
    size: style.size,
  };
}

/** Group chunks into visual lines (by baseline), left-to-right within a line. */
export function buildLines(chunks: TextChunk[]): Line[] {
  const sorted = chunks
    .filter((c) => c.str.trim().length > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: { y: number; size: number; chunks: TextChunk[] }[] = [];
  for (const c of sorted) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(c.y - g.y) <= Math.min(g.size, c.size) * 0.4) {
      // Skip exact duplicates (some PDFs fake bold by drawing text twice).
      const dup = g.chunks.some(
        (o) => o.str === c.str && Math.abs(o.x - c.x) < 1,
      );
      if (!dup) g.chunks.push(c);
      if (c.size > g.size) {
        g.size = c.size;
        g.y = c.y;
      }
    } else {
      groups.push({ y: c.y, size: c.size, chunks: [c] });
    }
  }
  return groups.map((g) => makeLine(g.chunks));
}

/** Build a sub-line from some of a line's segments. */
function subLine(segments: TextChunk[][]): Line {
  return makeLine(segments.flat());
}

// ---------------------------------------------------------------------------
// Ruling lines -> grid tables
// ---------------------------------------------------------------------------

const RULE_TOL = 2;

/** Merge collinear, touching/overlapping segments. */
export function mergeSegments(segs: Seg[], horizontal: boolean): Seg[] {
  const norm = segs
    .map((s) =>
      horizontal
        ? {
            c: (s.y0 + s.y1) / 2,
            a: Math.min(s.x0, s.x1),
            b: Math.max(s.x0, s.x1),
          }
        : {
            c: (s.x0 + s.x1) / 2,
            a: Math.min(s.y0, s.y1),
            b: Math.max(s.y0, s.y1),
          },
    )
    .sort((p, q) => p.c - q.c || p.a - q.a);

  // Bucket by coordinate, then merge intervals inside each bucket.
  const out: Seg[] = [];
  let i = 0;
  while (i < norm.length) {
    let j = i;
    while (j + 1 < norm.length && norm[j + 1].c - norm[i].c <= 1.5) j++;
    const bucket = norm.slice(i, j + 1).sort((p, q) => p.a - q.a);
    const c = bucket.reduce((s, p) => s + p.c, 0) / bucket.length;
    let a = bucket[0].a;
    let b = bucket[0].b;
    const flush = () =>
      out.push(
        horizontal
          ? { x0: a, x1: b, y0: c, y1: c }
          : { x0: c, x1: c, y0: a, y1: b },
      );
    for (let k = 1; k < bucket.length; k++) {
      if (bucket[k].a <= b + RULE_TOL) b = Math.max(b, bucket[k].b);
      else {
        flush();
        a = bucket[k].a;
        b = bucket[k].b;
      }
    }
    flush();
    i = j + 1;
  }
  return out;
}

/** Cluster sorted-ish numbers that are within `tol` of each other. */
export function clusterValues(values: number[], tol: number): number[] {
  const s = values.slice().sort((a, b) => a - b);
  const out: number[] = [];
  let group: number[] = [];
  for (const v of s) {
    if (group.length && v - group[group.length - 1] > tol) {
      out.push(group.reduce((a, b) => a + b, 0) / group.length);
      group = [];
    }
    group.push(v);
  }
  if (group.length) out.push(group.reduce((a, b) => a + b, 0) / group.length);
  return out;
}

function hasVerticalAt(v: Seg[], x: number, ya: number, yb: number): boolean {
  const mid = (ya + yb) / 2;
  return v.some(
    (s) =>
      Math.abs(s.x0 - x) <= RULE_TOL + 0.5 &&
      s.y0 <= mid + RULE_TOL &&
      s.y1 >= mid - RULE_TOL,
  );
}

function hasHorizontalAt(h: Seg[], y: number, xa: number, xb: number): boolean {
  const mid = (xa + xb) / 2;
  return h.some(
    (s) =>
      Math.abs(s.y0 - y) <= RULE_TOL + 0.5 &&
      s.x0 <= mid + RULE_TOL &&
      s.x1 >= mid - RULE_TOL,
  );
}

function indexIn(edges: number[], v: number): number {
  for (let i = 0; i < edges.length - 1; i++) {
    if (v < edges[i + 1]) return i;
  }
  return edges.length - 2;
}

interface GridSpec {
  colEdges: number[];
  rowEdges: number[];
  h: Seg[];
  v: Seg[];
}

/** Find connected groups of horizontal + vertical rules and derive grids. */
export function findGrids(
  hLines: Seg[],
  vLines: Seg[],
  pageArea: number,
): GridSpec[] {
  const h = mergeSegments(hLines, true).filter((s) => s.x1 - s.x0 >= 4);
  const v = mergeSegments(vLines, false).filter((s) => s.y1 - s.y0 >= 4);
  const n = h.length + v.length;
  if (h.length < 2 || v.length < 2) return [];

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (let i = 0; i < h.length; i++) {
    for (let j = 0; j < v.length; j++) {
      const a = h[i];
      const b = v[j];
      if (
        b.x0 >= a.x0 - RULE_TOL &&
        b.x0 <= a.x1 + RULE_TOL &&
        a.y0 >= b.y0 - RULE_TOL &&
        a.y0 <= b.y1 + RULE_TOL
      ) {
        parent[find(i)] = find(h.length + j);
      }
    }
  }

  const groups = new Map<number, { h: Seg[]; v: Seg[] }>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, { h: [], v: [] });
    const g = groups.get(r)!;
    if (i < h.length) g.h.push(h[i]);
    else g.v.push(v[i - h.length]);
  }

  const grids: GridSpec[] = [];
  for (const g of groups.values()) {
    if (g.h.length < 2 || g.v.length < 2) continue;
    const x0 = Math.min(...g.h.map((s) => s.x0), ...g.v.map((s) => s.x0));
    const x1 = Math.max(...g.h.map((s) => s.x1), ...g.v.map((s) => s.x0));
    const y0 = Math.min(...g.v.map((s) => s.y0), ...g.h.map((s) => s.y0));
    const y1 = Math.max(...g.v.map((s) => s.y1), ...g.h.map((s) => s.y0));
    const colEdges = clusterValues(
      [x0, x1, ...g.v.map((s) => s.x0)],
      RULE_TOL * 1.5,
    );
    const rowEdges = clusterValues(
      [y0, y1, ...g.h.map((s) => s.y0)],
      RULE_TOL * 1.5,
    );
    const cols = colEdges.length - 1;
    const rows = rowEdges.length - 1;
    // Single-column grids (framed boxes, rule-separated lists, page borders)
    // are left to the text flow, where borderless-table detection can still
    // recover any columns inside them.
    if (cols < 2 || rows < 1) continue;
    // A frame around most of the page with barely any structure is a border.
    if ((x1 - x0) * (y1 - y0) > pageArea * 0.8 && cols * rows < 4) continue;
    grids.push({ colEdges, rowEdges, h: g.h, v: g.v });
  }
  return grids;
}

interface RawCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  chunks: TextChunk[];
}

/** Resolve merged cells: a missing rule between two grid cells merges them. */
function gridCells(g: GridSpec): RawCell[] {
  const rows = g.rowEdges.length - 1;
  const cols = g.colEdges.length - 1;
  const covered: boolean[][] = Array.from({ length: rows }, () =>
    new Array(cols).fill(false),
  );
  const cells: RawCell[] = [];
  const ruleRight = (r: number, c: number) =>
    hasVerticalAt(g.v, g.colEdges[c + 1], g.rowEdges[r], g.rowEdges[r + 1]);
  const ruleBelow = (r: number, c: number) =>
    hasHorizontalAt(g.h, g.rowEdges[r + 1], g.colEdges[c], g.colEdges[c + 1]);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (covered[r][c]) continue;
      let colSpan = 1;
      while (
        c + colSpan < cols &&
        !covered[r][c + colSpan] &&
        !ruleRight(r, c + colSpan - 1)
      ) {
        colSpan++;
      }
      let rowSpan = 1;
      const canExtendDown = (rr: number) => {
        for (let k = c; k < c + colSpan; k++) {
          if (covered[rr + 1]?.[k] !== false) return false;
          if (ruleBelow(rr, k)) return false;
        }
        return true;
      };
      while (r + rowSpan < rows && canExtendDown(r + rowSpan - 1)) rowSpan++;
      for (let rr = r; rr < r + rowSpan; rr++) {
        for (let k = c; k < c + colSpan; k++) covered[rr][k] = true;
      }
      cells.push({ row: r, col: c, rowSpan, colSpan, chunks: [] });
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Multi-column (newspaper) page detection
// ---------------------------------------------------------------------------

type ColumnTag = "full" | "left" | "right";

interface FlowLine {
  line: Line;
  tag: ColumnTag;
  regionX0: number;
  regionX1: number;
}

/** Find a vertical whitespace gutter splitting the page into two columns. */
export function findGutter(lines: Line[]): number | null {
  if (lines.length < 8) return null;
  const left = Math.min(...lines.map((l) => l.x0));
  const right = Math.max(...lines.map((l) => l.x1));
  const W = right - left;
  if (W < 200) return null;

  const counts = new Uint16Array(Math.ceil(W) + 1);
  for (const l of lines) {
    for (const s of l.segments) {
      const a = Math.floor(s[0].x - left);
      const b = Math.ceil(Math.max(...s.map(chunkRight)) - left);
      for (let x = Math.max(0, a); x <= Math.min(counts.length - 1, b); x++) {
        counts[x]++;
      }
    }
  }
  const allowed = Math.max(2, Math.floor(lines.length * 0.05));
  const lo = Math.floor(W * 0.3);
  const hi = Math.ceil(W * 0.7);
  let best: [number, number] | null = null;
  let start = -1;
  for (let x = lo; x <= hi + 1; x++) {
    const free = x <= hi && counts[x] <= allowed;
    if (free && start < 0) start = x;
    if (!free && start >= 0) {
      if (!best || x - start > best[1] - best[0]) best = [start, x];
      start = -1;
    }
  }
  if (!best || best[1] - best[0] < 8) return null;
  const gx = left + (best[0] + best[1]) / 2;

  // Both sides must hold real prose, otherwise this is just a table.
  const leftSegs: number[] = [];
  const rightSegs: number[] = [];
  for (const l of lines) {
    for (const s of l.segments) {
      const sx0 = s[0].x;
      const sx1 = Math.max(...s.map(chunkRight));
      if (sx1 <= gx) leftSegs.push(sx1 - sx0);
      else if (sx0 >= gx) rightSegs.push(sx1 - sx0);
    }
  }
  if (leftSegs.length < 6 || rightSegs.length < 6) return null;
  if (median(leftSegs) < W * 0.25 || median(rightSegs) < W * 0.25) return null;
  return gx;
}

/** Order lines for reading: full-width lines in place, columns left-then-right. */
function orderFlow(lines: Line[]): FlowLine[] {
  const left = lines.length ? Math.min(...lines.map((l) => l.x0)) : 0;
  const right = lines.length ? Math.max(...lines.map((l) => l.x1)) : 0;
  const gutter = findGutter(lines);
  if (gutter === null) {
    return lines.map((line) => ({
      line,
      tag: "full" as const,
      regionX0: left,
      regionX1: right,
    }));
  }

  const out: FlowLine[] = [];
  let bandL: Line[] = [];
  let bandR: Line[] = [];
  const flush = () => {
    const lx1 = bandL.length ? Math.max(...bandL.map((l) => l.x1)) : gutter;
    const rx0 = bandR.length ? Math.min(...bandR.map((l) => l.x0)) : gutter;
    for (const l of bandL)
      out.push({ line: l, tag: "left", regionX0: left, regionX1: lx1 });
    for (const l of bandR)
      out.push({ line: l, tag: "right", regionX0: rx0, regionX1: right });
    bandL = [];
    bandR = [];
  };
  for (const line of lines) {
    const crosses = line.segments.some(
      (s) => s[0].x < gutter && Math.max(...s.map(chunkRight)) > gutter,
    );
    if (crosses) {
      flush();
      out.push({ line, tag: "full", regionX0: left, regionX1: right });
      continue;
    }
    const ls = line.segments.filter((s) => s[0].x < gutter);
    const rs = line.segments.filter((s) => s[0].x >= gutter);
    if (ls.length) bandL.push(subLine(ls));
    if (rs.length) bandR.push(subLine(rs));
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// Borderless (whitespace-aligned) tables
// ---------------------------------------------------------------------------

function segBounds(s: TextChunk[]): [number, number] {
  return [s[0].x, Math.max(...s.map(chunkRight))];
}

/**
 * Try to interpret consecutive lines as a table whose columns are separated
 * by vertical whitespace. Returns null if the lines don't look tabular.
 */
export function buildAlignedTable(lines: Line[]): Table | null {
  if (lines.length < 2) return null;
  const x0 = Math.min(...lines.map((l) => l.x0));
  const x1 = Math.max(...lines.map((l) => l.x1));
  const size = median(lines.map((l) => l.size)) || 10;

  // Column coverage profile at 0.5pt resolution.
  const res = 2;
  const counts = new Uint16Array(Math.ceil((x1 - x0) * res) + 2);
  for (const l of lines) {
    for (const s of l.segments) {
      const [a, b] = segBounds(s);
      const ia = Math.max(0, Math.floor((a - x0) * res));
      const ib = Math.min(counts.length - 1, Math.ceil((b - x0) * res));
      for (let i = ia; i <= ib; i++) counts[i]++;
    }
  }
  // Allow a few spanning rows (titles, group headers) in larger tables.
  const allowed =
    lines.length >= 8 ? Math.floor(lines.length * 0.12) : lines.length >= 4 ? 1 : 0;
  const minGap = Math.max(size * 0.5, 3) * res;
  const separators: number[] = [];
  let start = -1;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] <= allowed) {
      if (start < 0) start = i;
    } else {
      // A free run strictly inside the table (not at its edges) is a gutter.
      if (start > 0 && i - start >= minGap) {
        separators.push(x0 + (start + i) / 2 / res);
      }
      start = -1;
    }
  }
  if (separators.length === 0) return null;

  const colEdges = [x0, ...separators, x1];
  const nCols = colEdges.length - 1;
  const colOf = (x: number) => indexIn(colEdges, x);

  // Rows -> cells
  type Row = { line: Line; cells: Map<number, { span: number; chunks: TextChunk[] }> };
  const rows: Row[] = lines.map((line) => {
    const cells = new Map<number, { span: number; chunks: TextChunk[] }>();
    for (const s of line.segments) {
      const [a, b] = segBounds(s);
      const c0 = colOf(a + 0.5);
      const c1 = Math.max(c0, colOf(b - 0.5));
      const existing = cells.get(c0);
      if (existing) {
        existing.chunks.push(...s);
        existing.span = Math.max(existing.span, c1 - c0 + 1);
      } else {
        cells.set(c0, { span: c1 - c0 + 1, chunks: [...s] });
      }
    }
    return { line, cells };
  });

  // Validation
  const multi = rows.filter((r) => r.cells.size >= 2).length;
  if (multi < Math.max(2, Math.ceil(rows.length * 0.5))) return null;
  if (nCols === 2) {
    // Two long text columns side by side = prose, not a table.
    const lens = [0, 1].map((c) =>
      median(
        rows
          .map((r) => r.cells.get(c))
          .filter((x): x is { span: number; chunks: TextChunk[] } => !!x)
          .map((x) => textLength(x.chunks)),
      ),
    );
    if (lens[0] > 35 && lens[1] > 35) return null;
  }

  // Merge wrapped-text continuation lines into the row above when they are
  // clearly tighter than the normal row pitch and the first column is empty.
  const pitches: number[] = [];
  for (let i = 1; i < rows.length; i++) pitches.push(rows[i].line.y - rows[i - 1].line.y);
  const pitch = median(pitches);
  const merged: Row[] = [];
  for (const r of rows) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      !r.cells.has(0) &&
      r.line.y - prev.line.y < pitch / 1.5 &&
      r.line.y - prev.line.y < r.line.size * 1.6
    ) {
      for (const [c, cell] of r.cells) {
        const target = prev.cells.get(c);
        if (target) target.chunks.push(...cell.chunks);
        else prev.cells.set(c, cell);
      }
      continue;
    }
    merged.push({ line: r.line, cells: new Map(r.cells) });
  }

  const rowEdges: number[] = [lineTop(merged[0].line)];
  for (let i = 1; i < merged.length; i++) {
    const a = merged[i - 1];
    const aBottom = Math.max(
      ...[...a.cells.values()].flatMap((c) => c.chunks.map((k) => k.y + k.size * DESCENT)),
    );
    rowEdges.push((aBottom + lineTop(merged[i].line)) / 2);
  }
  const last = merged[merged.length - 1];
  rowEdges.push(
    Math.max(...[...last.cells.values()].flatMap((c) => c.chunks.map((k) => k.y + k.size * DESCENT))),
  );

  const cells: TableCell[] = [];
  merged.forEach((r, ri) => {
    const occupied = new Set<number>();
    for (const [c, cell] of [...r.cells.entries()].sort((a, b) => a[0] - b[0])) {
      if (occupied.has(c)) {
        // Shouldn't happen; fold into the earlier cell.
        continue;
      }
      const span = Math.min(cell.span, nCols - c);
      for (let k = c; k < c + span; k++) occupied.add(k);
      cells.push({
        row: ri,
        col: c,
        rowSpan: 1,
        colSpan: span,
        paragraphs: buildParagraphs(
          buildLines(cell.chunks).map((line) => ({
            line,
            tag: "full" as const,
            regionX0: colEdges[c],
            regionX1: colEdges[c + span],
          })),
          size,
        ),
      });
    }
    // Fill holes so every grid slot is represented.
    for (let c = 0; c < nCols; c++) {
      if (!occupied.has(c)) {
        cells.push({ row: ri, col: c, rowSpan: 1, colSpan: 1, paragraphs: [] });
      }
    }
  });
  cells.sort((a, b) => a.row - b.row || a.col - b.col);

  return {
    kind: "aligned",
    x0,
    x1,
    y0: rowEdges[0],
    y1: rowEdges[rowEdges.length - 1],
    colEdges,
    rowEdges,
    cells,
  };
}

// ---------------------------------------------------------------------------
// Paragraphs
// ---------------------------------------------------------------------------

const BULLET_RE = /^\s*([•●○◦▪■□►▸‣⁃–—*·-]|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)]|\(?[ivxIVX]{1,5}[.)])\s+/;

export function startsWithBullet(text: string): boolean {
  return BULLET_RE.test(text);
}

function paraStyle(lines: Line[]) {
  return dominantStyle(lines.flatMap((l) => l.chunks));
}

function finishParagraph(fl: FlowLine[], bodySize: number): Paragraph {
  const lines = fl.map((f) => f.line);
  const regionX0 = Math.min(fl[0].regionX0, ...lines.map((l) => l.x0));
  const regionX1 = Math.max(fl[0].regionX1, ...lines.map((l) => l.x1));
  const W = Math.max(1, regionX1 - regionX0);
  const style = paraStyle(lines);
  const size = style.size;

  const lefts = lines.map((l) => l.x0 - regionX0);
  const rights = lines.map((l) => regionX1 - l.x1);
  let align: Align = "left";
  const centered = lines.every(
    (_l, i) => Math.abs(lefts[i] - rights[i]) <= Math.max(W * 0.06, size * 2),
  );
  if (centered && Math.min(...lefts) > size * 3) align = "center";
  else if (rights.every((r) => r <= size) && Math.min(...lefts) > W * 0.25)
    align = "right";
  else if (
    lines.length >= 3 &&
    rights.slice(0, -1).every((r) => r <= size * 0.6)
  )
    align = "justify";

  let indent = 0;
  let firstLine = 0;
  if (align === "left" || align === "justify") {
    const rest = lefts.slice(1);
    indent = rest.length ? Math.min(...rest) : lefts[0];
    firstLine = lefts[0] - indent;
  }

  const steps: number[] = [];
  for (let i = 1; i < lines.length; i++) steps.push((lines[i].y - lines[i - 1].y) / size);
  const lineRatio = steps.length ? clamp(median(steps), 1, 3) : 1.2;

  const chars = lines.reduce((n, l) => n + textLength(l.chunks), 0);
  let heading = 0;
  if (lines.length <= 3 && chars <= 200) {
    if (size >= bodySize * 1.5) heading = 1;
    else if (size >= bodySize * 1.25) heading = 2;
    else if (size >= bodySize * 1.1 && style.bold) heading = 3;
  }

  return {
    lines,
    regionX0,
    regionX1,
    align,
    indent: Math.max(0, indent),
    firstLine,
    size,
    bold: style.bold,
    heading,
    lineRatio,
    top: lineTop(lines[0]),
    bottom: lineBottom(lines[lines.length - 1]),
  };
}

/** Merge consecutive flow lines into paragraphs. */
function buildParagraphs(flow: FlowLine[], bodySize: number): Paragraph[] {
  const out: Paragraph[] = [];
  let cur: FlowLine[] = [];

  // The local right edge of running text: the furthest any nearby prose line
  // (same column, similar size, no wide gaps) reaches. Comparing against this
  // rather than the page/column edge keeps ragged-right text together while
  // still ending a paragraph at a visibly short line.
  const localRight = flow.map((f, i) => {
    let r = f.line.x1;
    for (let j = Math.max(0, i - 8); j <= Math.min(flow.length - 1, i + 8); j++) {
      const o = flow[j];
      if (
        o.tag === f.tag &&
        o.line.segments.length === 1 &&
        Math.abs(o.line.size - f.line.size) <= f.line.size * 0.15
      ) {
        r = Math.max(r, o.line.x1);
      }
    }
    return r;
  });

  const continues = (prev: FlowLine, next: FlowLine, prevIndex: number): boolean => {
    const a = prev.line;
    const b = next.line;
    if (prev.tag !== next.tag) return false;
    const dy = b.y - a.y;
    if (dy <= 0 || dy > Math.max(a.size, b.size) * 1.55) return false;
    if (Math.abs(a.size - b.size) > Math.max(a.size, b.size) * 0.12) return false;
    if (paraStyle([a]).bold !== paraStyle([b]).bold) return false;
    if (startsWithBullet(lineText(b))) return false;

    const W = Math.max(1, prev.regionX1 - prev.regionX0);
    const first = cur[0].line;
    const bothCentered =
      Math.abs(a.x0 - prev.regionX0 - (prev.regionX1 - a.x1)) < W * 0.06 &&
      Math.abs(b.x0 - next.regionX0 - (next.regionX1 - b.x1)) < W * 0.06 &&
      a.x0 - prev.regionX0 > a.size * 3;
    if (bothCentered) return true;

    // Previous line ended well before the text's right edge: paragraph ended.
    const right = localRight[prevIndex];
    const textW = Math.max(1, right - prev.regionX0);
    if (a.x1 < right - Math.max(textW * 0.18, a.size * 5)) return false;

    if (cur.length === 1) {
      // Second line: allow first-line indent or hanging bullet indent.
      const d = b.x0 - first.x0;
      return d >= -a.size * 4.5 && d <= a.size * 3.5;
    }
    const body = cur[1].line.x0;
    return Math.abs(b.x0 - body) <= a.size * 0.8;
  };

  for (let i = 0; i < flow.length; i++) {
    const fl = flow[i];
    if (cur.length && continues(cur[cur.length - 1], fl, i - 1)) {
      cur.push(fl);
    } else {
      if (cur.length) out.push(finishParagraph(cur, bodySize));
      cur = [fl];
    }
  }
  if (cur.length) out.push(finishParagraph(cur, bodySize));
  return out;
}

/** Join paragraph lines into one text stream (with de-hyphenation). */
export function paragraphText(p: Paragraph): string {
  let s = "";
  for (const line of p.lines) {
    const t = lineText(line);
    if (!s) s = t;
    else if (/[A-Za-zÀ-ÿ]-$/.test(s) && /^[a-zà-ÿ]/.test(t)) s = s.slice(0, -1) + t;
    else s += " " + t;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Page analysis
// ---------------------------------------------------------------------------

function computeBodySize(chunks: TextChunk[]): number {
  const w = new Map<number, number>();
  for (const c of chunks) {
    const k = Math.round(c.size * 2) / 2;
    w.set(k, (w.get(k) ?? 0) + c.str.length);
  }
  let best = 11;
  let bestW = -1;
  for (const [k, v] of w) {
    if (v > bestW) {
      best = k;
      bestW = v;
    }
  }
  return best;
}

function center(c: TextChunk): [number, number] {
  return [c.x + c.width / 2, c.y - c.size * 0.3];
}

function inside(b: Box, x: number, y: number, tol = 1): boolean {
  return x >= b.x0 - tol && x <= b.x1 + tol && y >= b.y0 - tol && y <= b.y1 + tol;
}

export function analyzePage(content: PageContent): PageLayout {
  const pageArea = content.width * content.height;
  const bodySize = computeBodySize(content.chunks);
  const anchors: Block[] = [];
  let remaining = content.chunks.filter((c) => c.str.trim().length > 0);

  // 1. Ruled tables claim the text inside them.
  for (const g of findGrids(content.hLines, content.vLines, pageArea)) {
    const box: Box = {
      x0: g.colEdges[0],
      x1: g.colEdges[g.colEdges.length - 1],
      y0: g.rowEdges[0],
      y1: g.rowEdges[g.rowEdges.length - 1],
    };
    const raw = gridCells(g);
    const claimed: TextChunk[] = [];
    const rest: TextChunk[] = [];
    for (const c of remaining) {
      const [cx, cy] = center(c);
      if (!inside(box, cx, cy)) {
        rest.push(c);
        continue;
      }
      const r = indexIn(g.rowEdges, cy);
      const col = indexIn(g.colEdges, cx);
      const cell = raw.find(
        (k) =>
          r >= k.row && r < k.row + k.rowSpan && col >= k.col && col < k.col + k.colSpan,
      );
      if (cell) {
        cell.chunks.push(c);
        claimed.push(c);
      } else rest.push(c);
    }
    if (claimed.length === 0) continue; // decorative box / chart frame
    remaining = rest;

    const tableArea = (box.x1 - box.x0) * (box.y1 - box.y0);
    const cells: TableCell[] = raw.map((k) => {
      const cx0 = g.colEdges[k.col];
      const cx1 = g.colEdges[k.col + k.colSpan];
      const cy0 = g.rowEdges[k.row];
      const cy1 = g.rowEdges[k.row + k.rowSpan];
      const mx = (cx0 + cx1) / 2;
      const my = (cy0 + cy1) / 2;
      let fill: string | undefined;
      let fillArea = Infinity;
      for (const f of content.fills) {
        const a = (f.x1 - f.x0) * (f.y1 - f.y0);
        if (
          inside(f, mx, my, 0.5) &&
          a < tableArea * 0.9 &&
          a < fillArea &&
          f.color.toUpperCase() !== "FFFFFF"
        ) {
          fill = f.color;
          fillArea = a;
        }
      }
      return {
        row: k.row,
        col: k.col,
        rowSpan: k.rowSpan,
        colSpan: k.colSpan,
        fill,
        paragraphs: buildParagraphs(
          buildLines(k.chunks).map((line) => ({
            line,
            tag: "full" as const,
            regionX0: cx0,
            regionX1: cx1,
          })),
          bodySize,
        ),
      };
    });
    anchors.push({
      type: "table",
      top: box.y0,
      bottom: box.y1,
      t: { kind: "ruled", ...box, colEdges: g.colEdges, rowEdges: g.rowEdges, cells },
    });
  }

  // 2. Images (skip full-page backgrounds behind real text).
  const hasText = remaining.length > 0 || anchors.length > 0;
  for (const img of content.images) {
    const area = (img.x1 - img.x0) * (img.y1 - img.y0);
    if (hasText && area > pageArea * 0.6) continue;
    anchors.push({ type: "image", top: img.y0, bottom: img.y1, img });
  }

  // 3. Lines in reading order, borderless tables, paragraphs.
  const flow = orderFlow(buildLines(remaining));
  const blocks: Block[] = [];
  let i = 0;
  let pending: FlowLine[] = [];
  const flushParas = () => {
    for (const p of buildParagraphs(pending, bodySize)) {
      blocks.push({ type: "paragraph", top: p.top, bottom: p.bottom, p });
    }
    pending = [];
  };
  while (i < flow.length) {
    const fl = flow[i];
    if (fl.line.segments.length >= 2) {
      // Grow a run of tabular-looking lines.
      let j = i;
      let lastMulti = i;
      while (j + 1 < flow.length) {
        const nx = flow[j + 1];
        const cur = flow[j];
        if (nx.tag !== fl.tag) break;
        const dy = nx.line.y - cur.line.y;
        const lim = Math.max(cur.line.size, nx.line.size) * 3.2;
        if (dy <= 0 || dy > lim) break;
        if (nx.line.segments.length >= 2) {
          j++;
          lastMulti = j;
          continue;
        }
        const nn = flow[j + 2];
        const runW = fl.line.x1 - fl.line.x0;
        if (
          nn &&
          nn.tag === fl.tag &&
          nn.line.segments.length >= 2 &&
          nn.line.y - nx.line.y > 0 &&
          nn.line.y - nx.line.y <= lim &&
          nx.line.x1 - nx.line.x0 < runW * 0.5
        ) {
          j++;
          continue;
        }
        break;
      }
      if (lastMulti > i) {
        const run = flow.slice(i, lastMulti + 1).map((f) => f.line);
        const table = buildAlignedTable(run);
        if (table) {
          flushParas();
          blocks.push({ type: "table", top: table.y0, bottom: table.y1, t: table });
          i = lastMulti + 1;
          continue;
        }
      }
    }
    pending.push(fl);
    i++;
  }
  flushParas();

  // 4. Interleave anchored blocks (ruled tables, images) by vertical position.
  anchors.sort((a, b) => a.top - b.top);
  const merged: Block[] = [];
  let k = 0;
  for (const b of blocks) {
    while (k < anchors.length && anchors[k].top <= b.top) merged.push(anchors[k++]);
    merged.push(b);
  }
  while (k < anchors.length) merged.push(anchors[k++]);

  // 5. Margins from the content bounding box.
  const xs0: number[] = [];
  const xs1: number[] = [];
  for (const b of merged) {
    if (b.type === "paragraph") {
      xs0.push(...b.p.lines.map((l) => l.x0));
      xs1.push(...b.p.lines.map((l) => l.x1));
    } else if (b.type === "table") {
      xs0.push(b.t.x0);
      xs1.push(b.t.x1);
    } else {
      xs0.push(b.img.x0);
      xs1.push(b.img.x1);
    }
  }
  const W = content.width;
  const H = content.height;
  const margins = merged.length
    ? {
        left: clamp(Math.min(...xs0), 18, 144),
        right: clamp(W - Math.max(...xs1), 18, 144),
        top: clamp(Math.min(...merged.map((b) => b.top)), 18, 144),
        bottom: clamp(H - Math.max(...merged.map((b) => b.bottom)), 18, 144),
      }
    : { left: 72, right: 72, top: 72, bottom: 72 };
  // Keep a usable content width on narrow pages.
  if (W - margins.left - margins.right < W * 0.4) {
    margins.left = margins.right = Math.min(margins.left, margins.right, W * 0.1);
  }

  return { width: W, height: H, margins, bodySize, blocks: merged };
}

// ---------------------------------------------------------------------------
// Cell value parsing (Excel)
// ---------------------------------------------------------------------------

export interface ParsedNumber {
  value: number;
  numFmt?: string;
}

/**
 * Parse spreadsheet-style numbers: "1,234.56", "(1,234)", "-12%", "$1,200",
 * "1 234,56 €", "12.5". Returns null for anything that should stay text
 * (IDs with leading zeros, phone numbers, dates, very long digit strings).
 */
export function parseNumber(raw: string): ParsedNumber | null {
  let s = raw.trim().replace(/[\u00a0\u202f]/g, " ");
  if (!s || s.length > 30) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  let currency = "";
  const cur = s.match(/^([$€£¥])\s?|\s?([$€£¥])$/);
  if (cur) {
    currency = cur[1] ?? cur[2];
    s = s.replace(cur[0], "").trim();
  }
  if (/^[-−–]/.test(s)) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) s = s.slice(1).trim();
  if (!currency) {
    const c2 = s.match(/^([$€£¥])\s?/);
    if (c2) {
      currency = c2[1];
      s = s.slice(c2[0].length);
    }
  }
  let percent = false;
  if (s.endsWith("%")) {
    percent = true;
    s = s.slice(0, -1).trim();
  }
  if (!/^\d[\d.,\s']*$/.test(s)) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length > 15) return null;
  if (/^0\d/.test(s) && !/^0[.,]/.test(s)) return null; // leading-zero ID

  let normalized: string;
  let grouped = false;
  let decimals = 0;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (/\s|'/.test(s)) {
    // "1 234,56" / "1'234.56"
    if (!/^\d{1,3}([\s']\d{3})+([.,]\d+)?$/.test(s)) return null;
    grouped = true;
    normalized = s.replace(/[\s']/g, "").replace(",", ".");
  } else if (lastDot >= 0 && lastComma >= 0) {
    const decSep = lastDot > lastComma ? "." : ",";
    const grpSep = decSep === "." ? "," : ".";
    const re = new RegExp(`^\\d{1,3}(\\${grpSep}\\d{3})+\\${decSep}\\d+$`);
    if (!re.test(s)) return null;
    grouped = true;
    normalized = s.split(grpSep).join("").replace(decSep, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    if (parts.length > 2) {
      // Multiple separators of one kind: thousands grouping.
      if (!new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(s)) return null;
      grouped = true;
      normalized = parts.join("");
    } else if (sep === "," && parts[1].length === 3 && parts[0] !== "0") {
      grouped = true; // "1,234" -> thousands
      normalized = parts.join("");
    } else {
      normalized = parts.join(".");
    }
  } else {
    normalized = s;
  }
  const dot = normalized.indexOf(".");
  if (dot >= 0) decimals = normalized.length - dot - 1;
  let value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  if (negative) value = -value;

  const dec = decimals > 0 ? "." + "0".repeat(Math.min(decimals, 10)) : "";
  let numFmt: string | undefined;
  if (percent) {
    value /= 100;
    numFmt = `0${dec}%`;
  } else {
    const base = (grouped || currency ? "#,##0" : "0") + dec;
    const withCur = currency ? `"${currency}"${base}` : base;
    const parens = negative && /^\(/.test(raw.trim());
    numFmt = parens ? `${withCur};(${withCur})` : withCur;
    if (!grouped && !currency && !dec && !parens) numFmt = undefined;
  }
  return { value, numFmt };
}
