# OCR benchmark

Generated with `npm run bench:ocr` (writes `ocr-latest.json`), from
`src/pdf/ocr/ocr.integration.test.ts`.

- Date: 2026-11-25 · Environment: linux x64, 4 vCPU container, Node v22.23.5
- Engine: tesseract.js 7.0.0, LSTM-only, tessdata 4.0.0 best_int · Raster: 300 dpi · one worker
- Fixtures: synthetic A4 pages, Noto Sans 16 pt, three lines each, turned
  into image-only "scans" at 200 dpi (100 dpi for the degraded case).

| Fixture | Lang | Page rotation | ms/page | Confidence | CER | WER | CER of text layer (Poppler) |
|---|---|---|---|---|---|---|---|
| english-clean | eng | 0° | 2315 | 96 | 0.000 | 0.000 | 0.000 |
| french-accents | fra | 0° | 1615 | 95 | 0.000 | 0.000 | 0.000 |
| mixed-en-fr | eng+fra | 0° | 2012 | 95 | 0.000 | 0.000 | 0.000 |
| french-rotated-90 | fra | 90° | 1421 | 95 | 0.000 | 0.000 | 0.000 |
| english-rotated-270 | eng | 270° | 1789 | 96 | 0.000 | 0.000 | 0.000 |
| english-low-contrast | eng | 0° | 1462 | 96 | 0.000 | 0.000 | 0.000 |
| french-degraded-100dpi-skew2 | fra | 0° | 1440 | 95 | 0.000 | 0.000 | 0.000 |

CER/WER: edit distance to the reference divided by its length, whitespace
normalised, case and accents significant. Engineering targets from the brief
(clean scans: CER ≤ 5 %, WER ≤ 10 %) are asserted by the test for every
non-degraded fixture. "ms/page" includes rasterising the page.

Also verified per fixture: the searchable PDF renders pixel-identical to the
scan; text extracted by PDF.js and Poppler matches the recognised text; word
bounding boxes from Poppler land where the source text was drawn; pypdf
extracts the 90°-rotated page in reading order. Memory (RSS of the test
process with three workers alive) peaked around 1 GB.

**Limits of this evidence.** Clean, synthetic, single-font pages. Real-world
scans (photographs, uneven lighting, handwriting, tables, small print,
multi-column layouts) will have higher error rates; no claim is made about
them. Times come from a CI-class Linux container, not from a 4 GB Windows
laptop; expect several times slower on low-end hardware.
