# 0003 — OCR engine

**Options considered.** Tesseract.js (Apache-2.0, WASM, maintained, EN/FR
LSTM models); PaddleOCR/ONNX models in onnxruntime-web (larger runtime,
French support weaker, more moving parts); browser/OS OCR APIs (not
available offline on all targets, not under our control).

**Decision.** Tesseract.js 7 with the LSTM-only WASM cores (plain, SIMD,
relaxed SIMD) and tessdata **best_int** models (eng 2.9 MB, fra 0.7 MB),
copied into `dist/ocr/` with SHA-256 digests checked at build time; one
worker, created on demand, terminated after the job; `cacheMethod: "none"`
(no IndexedDB model cache); all URLs on the app origin.

**Searchable PDF.** Our own text-layer writer (pdf-lib): text rendering mode
3, Noto Sans subset, word-level matrices with horizontal scaling, positions
mapped back through the inverse of the PDF.js raster transform (handles
`/Rotate`, crop boxes). Lines skewed < 10° are written level so extractors
keep reading order.

**Consequences.** ≈ 4 MB engine + models in every desktop build (works on a
fresh offline install). No orientation detection (LSTM-only) — pages must be
upright. Accuracy figures in `docs/benchmarks/ocr.md` cover synthetic
fixtures only.
