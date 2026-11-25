# 0004 — Compression

**Decision.** Three profiles. *Lossless* re-saves with object streams and
merges byte-identical images (a duplicate is deleted only when nothing else
references it). *Balanced* (150 dpi, JPEG 0.75) and *strong* (100 dpi, 0.6)
replace image XObject streams in place (same object numbers, soft masks and
optional-content/metadata entries kept) when the image is larger than the
page needs at that resolution. Images with masks, decode arrays, CMYK,
indexed or 16-bit colour, JPX/JBIG2/CCITT, or TIFF predictors are skipped.
A replacement is kept only when smaller; the whole result is discarded when
it is not smaller than the input.

**Rejected.** Rasterising pages ("flatten to images") — destroys text,
forms, links and accessibility; not implemented. If added later it must be a
separate, explicitly lossy mode.

**Consequences.** Real gains on scans and photos (−52 % on the test scan at
balanced); little on text-only files. Target resolution is computed from the
largest page, which is conservative for images drawn small.
