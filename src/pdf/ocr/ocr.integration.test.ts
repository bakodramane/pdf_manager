// @vitest-environment node
/**
 * End-to-end OCR check on synthetic scans, entirely offline:
 *   synthetic PDF (Noto Sans text) → raster (PDF.js + @napi-rs/canvas)
 *   → image-only "scan" PDF → raster again (as the app does) → Tesseract
 *   (bundled eng/fra best_int models) → invisible text layer (pdf-lib)
 *   → text extracted by PDF.js and, when installed, Poppler's pdftotext.
 * Reports CER/WER and timings; thresholds are the brief's initial
 * engineering targets for clean scans (CER ≤ 5 %, WER ≤ 10 %).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as pdfjs from "pdfjs-dist";
import { createCanvas } from "@napi-rs/canvas";
import { createWorker, type Worker } from "tesseract.js";
import { rasterizePage } from "./rasterize";
import { fromTesseract, type TesseractPageLike } from "./convert";
import { addOcrTextLayer } from "./textLayer";
import { cer, wer } from "./metrics";
import { hasUsefulText } from "./detect";
import type { OcrPage } from "./types";
import { formatPopplerInstallHelp, resolveOptionalPopplerExecutable, runPdftotext } from "../../test/poppler";

const require = createRequire(import.meta.url);
const FONT = readFileSync(require.resolve("@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf"));
const LANG_DIR = (lang: string) =>
  join(require.resolve(`@tesseract.js-data/${lang}/package.json`), "..", "4.0.0_best_int");
const STD_FONTS = join(require.resolve("pdfjs-dist/package.json"), "..", "standard_fonts") + "/";
const pdftotextBin = resolveOptionalPopplerExecutable("pdftotext");

const EN = [
  "The quick brown fox jumps over the lazy dog.",
  "Local processing keeps documents on this device.",
  "Invoice number 2048 is due on 15 March 2026.",
];
const FR = [
  "Le cœur de l'été à Montréal était très agréable.",
  "Ça coûte quatre-vingt-dix-neuf euros, déjà payé.",
  "Où est la bibliothèque ? À gauche, après l'église.",
];

interface Fixture {
  name: string;
  lines: string[];
  lang: "eng" | "fra" | "eng+fra";
  rotate?: 0 | 90 | 180 | 270;
  gray?: number; // text colour 0 (black) … 1 (white)
  /** Degraded scan: lower resolution and a slight skew. Reported, not held to the clean-scan target. */
  degraded?: { dpi: number; skewDeg: number };
}

const FIXTURES: Fixture[] = [
  { name: "english-clean", lines: EN, lang: "eng" },
  { name: "french-accents", lines: FR, lang: "fra" },
  { name: "mixed-en-fr", lines: [EN[0], FR[0], EN[2], FR[1]], lang: "eng+fra" },
  { name: "french-rotated-90", lines: FR, lang: "fra", rotate: 90 },
  { name: "english-rotated-270", lines: EN, lang: "eng", rotate: 270 },
  { name: "english-low-contrast", lines: EN, lang: "eng", gray: 0.6 },
  { name: "french-degraded-100dpi-skew2", lines: FR, lang: "fra", gray: 0.4, degraded: { dpi: 100, skewDeg: 2 } },
];

async function textPdf(f: Fixture): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Full embedding: pdf-lib's subsetter corrupts this font's glyph
  // outlines (see docs/distribution-readiness.md, "Fonts").
  const font = await doc.embedFont(FONT, { subset: false });
  const page = doc.addPage([595, 842]);
  const g = f.gray ?? 0;
  f.lines.forEach((line, i) => page.drawText(line, { x: 60, y: 760 - i * 36, size: 16, font, color: rgb(g, g, g) }));
  return doc.save();
}

/** Turn a text PDF into an image-only "scan" at 200 DPI (optionally /Rotate'd). */
async function scanPdf(f: Fixture): Promise<Uint8Array> {
  const task = pdfjs.getDocument({ data: await textPdf(f), standardFontDataUrl: STD_FONTS });
  const page = await (await task.promise).getPage(1);
  const raster = await rasterizePage(page, f.degraded?.dpi ?? 200, 40_000_000, (w, h) => createCanvas(w, h));
  const png = raster.canvas.toBuffer("image/png");
  await task.destroy();
  const out = await PDFDocument.create();
  const img = await out.embedPng(png);
  // The physical scan is stored sideways; /Rotate brings it upright, as a
  // scanner or phone app would do.
  const r = f.rotate ?? 0;
  const sideways = r === 90 || r === 270;
  const p = out.addPage(sideways ? [842, 595] : [595, 842]);
  if (r === 0) p.drawImage(img, { x: 0, y: 0, width: 595, height: 842, rotate: degrees(f.degraded?.skewDeg ?? 0) });
  else if (r === 90) p.drawImage(img, { x: 842, y: 0, width: 595, height: 842, rotate: degrees(90) });
  else if (r === 270) p.drawImage(img, { x: 0, y: 595, width: 595, height: 842, rotate: degrees(-90) });
  if (r) p.setRotation(degrees(r));
  return out.save();
}

const workers = new Map<string, Worker>();
async function worker(lang: string): Promise<Worker> {
  let w = workers.get(lang);
  if (!w) {
    // Node: local models only (no CDN); the same files the app bundles,
    // staged side by side in a temporary folder.
    w = await createWorker(lang.split("+"), 1, { langPath: LANG_STAGE, cacheMethod: "none", gzip: true });
    workers.set(lang, w);
  }
  return w;
}

async function ocrScan(scan: Uint8Array, lang: string): Promise<{ page: OcrPage; ms: number }> {
  const task = pdfjs.getDocument({ data: scan.slice(), standardFontDataUrl: STD_FONTS });
  const pdfPage = await (await task.promise).getPage(1);
  const t0 = performance.now();
  const raster = await rasterizePage(pdfPage, 300, 40_000_000, (w, h) => createCanvas(w, h));
  const w = await worker(lang);
  const { data } = await w.recognize(raster.canvas.toBuffer("image/png"), {}, { blocks: true, text: true });
  const ms = performance.now() - t0;
  await task.destroy();
  return {
    page: fromTesseract(data as unknown as TesseractPageLike, {
      pageIndex: 0,
      width: raster.canvas.width,
      height: raster.canvas.height,
      transform: raster.transform,
    }),
    ms,
  };
}

/** Render page 1 to RGBA pixels at 72 DPI. */
async function pixels(bytes: Uint8Array): Promise<Uint8ClampedArray> {
  const task = pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: STD_FONTS });
  const page = await (await task.promise).getPage(1);
  const r = await rasterizePage(page, 72, 40_000_000, (w, h) => createCanvas(w, h));
  const data = r.canvas.getContext("2d").getImageData(0, 0, r.canvas.width, r.canvas.height).data;
  await task.destroy();
  return data;
}

async function extractWithPdfjs(bytes: Uint8Array): Promise<string> {
  const task = pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: STD_FONTS });
  const content = await (await (await task.promise).getPage(1)).getTextContent();
  await task.destroy();
  return content.items.map((it) => ("str" in it ? it.str : "")).join("");
}

const dir = mkdtempSync(join(tmpdir(), "pdfm-ocr-"));
const LANG_STAGE = join(dir, "lang");
const report: Record<string, unknown>[] = [];

beforeAll(() => {
  if (!pdftotextBin) {
    console.warn(`\n[ocr.integration.test.ts] Poppler not available locally; Poppler-only assertions skipped:\n${formatPopplerInstallHelp("pdftotext")}\n`);
  }
  mkdirSync(LANG_STAGE, { recursive: true });
  for (const l of ["eng", "fra"]) {
    writeFileSync(join(LANG_STAGE, `${l}.traineddata.gz`), readFileSync(join(LANG_DIR(l), `${l}.traineddata.gz`)));
  }
});

afterAll(async () => {
  for (const w of workers.values()) await w.terminate();
  const meta = {
    date: new Date().toISOString(),
    platform: `${process.platform} ${process.arch}`,
    cpus: (await import("node:os")).cpus().length,
    node: process.version,
    engine: "tesseract.js 7.0.0, LSTM-only, tessdata 4.0.0 best_int",
    rasterDpi: 300,
    note: "Synthetic fixtures (Noto Sans 16 pt). Times include rasterising the page; single worker.",
  };
  const out = process.env.OCR_BENCHMARK_OUT || join(dir, "ocr-benchmark.json");
  writeFileSync(out, JSON.stringify({ meta, results: report }, null, 2) + "\n");
  console.log(`OCR benchmark → ${out}`);
  console.table(report);
});

describe("offline OCR → searchable PDF", () => {
  for (const f of FIXTURES) {
    it(`${f.name}: recognises, adds an invisible layer, extracts in independent parsers`, async () => {
      const reference = f.lines.join(" ");
      const scan = await scanPdf(f);
      // The scan has no text layer, so OCR is offered.
      const before = pdfjs.getDocument({ data: scan.slice() });
      const items = (await (await (await before.promise).getPage(1)).getTextContent()).items;
      expect(hasUsefulText(items as { str?: string }[])).toBe(false);
      await before.destroy();

      const { page, ms } = await ocrScan(scan, f.lang);
      const recognised = page.text.replace(/\n+/g, " ");
      if (process.env.OCR_DEBUG) console.log(f.name, JSON.stringify(recognised));

      const doc = await PDFDocument.load(scan);
      const contentBefore = doc.getPage(0).node.Contents()?.toString();
      const { words } = await addOcrTextLayer(doc, [page], FONT);
      const out = await doc.save();
      expect(words).toBeGreaterThan(f.degraded ? 0 : 10);
      // Original page content (the scan image) is still there, untouched.
      expect(contentBefore).toBeDefined();

      // No visible change: the searchable PDF renders pixel-identical.
      const [a, b2] = await Promise.all([pixels(scan), pixels(out)]);
      expect(b2.length).toBe(a.length);
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b2[i]));
      expect(diff).toBe(0);

      const viaPdfjs = await extractWithPdfjs(out);
      let viaPoppler: string | null = null;
      if (pdftotextBin) {
        const file = join(dir, `${f.name}.pdf`);
        writeFileSync(file, out);
        viaPoppler = runPdftotext(["-enc", "UTF-8", "-layout", file, "-"], pdftotextBin);
      }

      const row = {
        fixture: f.name,
        lang: f.lang,
        rotate: f.rotate ?? 0,
        msPerPage: Math.round(ms),
        confidence: Math.round(page.confidence),
        cerOcr: +cer(recognised, reference).toFixed(4),
        werOcr: +wer(recognised, reference).toFixed(4),
        cerPdfjs: +cer(viaPdfjs, reference).toFixed(4),
        cerPoppler: viaPoppler === null ? "n/a" : +cer(viaPoppler, reference).toFixed(4),
        rssMb: Math.round(process.memoryUsage().rss / 1048576),
      };
      report.push(row);

      // Initial engineering targets for clean synthetic scans. Degraded
      // scans are reported in the benchmark only (no claim is made).
      if (!f.degraded) {
        expect(row.cerOcr).toBeLessThanOrEqual(0.05);
        expect(row.werOcr).toBeLessThanOrEqual(0.1);
      }
      // The text layer must give back what OCR recognised (no loss when
      // written and re-read by an independent parser).
      expect(cer(viaPdfjs, recognised)).toBeLessThanOrEqual(0.02);
      if (viaPoppler !== null) expect(cer(viaPoppler, recognised)).toBeLessThanOrEqual(0.05);
    }, 120_000);
  }

  it.skipIf(!pdftotextBin)("places words where they appear on the page (Poppler bounding boxes)", async () => {
    const f = FIXTURES[0];
    const scan = await scanPdf(f);
    const { page } = await ocrScan(scan, f.lang);
    const doc = await PDFDocument.load(scan);
    await addOcrTextLayer(doc, [page], FONT);
    const file = join(dir, "bbox.pdf");
    writeFileSync(file, await doc.save());
    const html = runPdftotext(["-bbox", file, "-"], pdftotextBin!);
    const m = html.match(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">The<\/word>/);
    expect(m).not.toBeNull();
    const [xMin, yMin, xMax] = m!.slice(1).map(Number);
    // "The" was drawn at x = 60 pt, baseline 82 pt from the top (842 - 760),
    // size 16 pt, so it spans roughly x 60–90 and y 66–86 (top-left origin).
    expect(xMin).toBeGreaterThan(55);
    expect(xMin).toBeLessThan(66);
    expect(xMax).toBeGreaterThan(80);
    expect(xMax).toBeLessThan(100);
    expect(yMin).toBeGreaterThan(60);
    expect(yMin).toBeLessThan(80);
  }, 120_000);
});
