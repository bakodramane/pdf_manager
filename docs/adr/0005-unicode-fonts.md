# 0005 — Fonts for annotations and the OCR layer

**Finding.** pdf-lib 1.17.1 + @pdf-lib/fontkit 1.1.1 subsetting of Noto Sans
produces wrong glyph outlines (text extraction still works). Verified by
rendering with PDF.js: subset → fragments of letters; full embedding →
correct.

**Decision.** English and French annotation text stays in the 14 standard
fonts (WinAnsi covers é, è, à, ç, œ, Œ, €, « »). Other Latin, Greek and
Cyrillic text switches that annotation to Noto Sans in the matching style,
embedded in full (≈ 600 KB per style used, only when needed). Characters no
bundled font covers (CJK, emoji, scripts needing shaping/bidi) stop the
export with a message listing them, instead of writing "?". The invisible
OCR layer uses a subset (outlines never painted).

**Revisit** when pdf-lib's subsetter is fixed or replaced (then subset
annotations too), or when shaping (HarfBuzz) is added for complex scripts.
