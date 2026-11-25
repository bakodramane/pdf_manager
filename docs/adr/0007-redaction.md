# 0007 — Redaction (deferred)

**Status.** Deferred. No feature labelled "redaction" is shipped; black
rectangles would only hide content visually.

**Why.** Genuine redaction must remove text and glyphs from content streams
(including those inside form XObjects and with repeated resources), image
pixels, OCR layers, annotations, form values, metadata, bookmarks and earlier
revisions, then be verified by extraction and rendering. pdf-lib exposes no
content-stream editor; doing it correctly needs a content-stream parser and
rewriter (e.g. qpdf/MuPDF-class tooling; MuPDF is AGPL, which conflicts with
the project's Apache-2.0 distribution without a commercial licence).

**Possible later path.** A separate "flatten and redact" mode: render each
page to pixels, paint redaction boxes into the pixels, rebuild the PDF from
images (optionally re-OCR outside the boxes), drop all original objects.
Destructive (no selectable original text, no forms) and must be labelled as
such; verified by searching for the redacted strings with Poppler, pypdf and
PDF.js.
