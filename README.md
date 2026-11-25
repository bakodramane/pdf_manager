# PDF Manager

**A free, open-source PDF editor that works entirely on your device — in
English and French.** No account, no uploads, no tracking.

*[Lire en français](README.fr.md)*

Created by **[Dramane Bako](https://github.com/bakodramane)** · Apache-2.0
licence · for students, teachers, researchers, administrations, NGOs and
small businesses, including on slow or expensive connections.

## Get it

| Edition | For | Notes |
|---|---|---|
| **Windows installer** (`…-Setup.exe`) | Windows 10/11 x64 | Installs for the current user only, **no administrator rights**, English or French setup |
| **Windows portable** (`…-portable.exe`) | Windows 10/11 x64 | No installation; run from any folder |
| **Web edition** | Any recent browser | Nothing to install; works offline after the first visit |

Download only from the project's
[GitHub Releases](https://github.com/bakodramane/pdf_manager/releases) page.
Check your download with the published `SHA256SUMS.txt`
([how to verify](docs/release/verify.md)).

> **Current status:** version 0.2.0 is in preparation. Windows builds are
> **not yet code-signed**; pre-release files are named `…-UNSIGNED.exe` and
> Windows SmartScreen will warn about them. If your organisation blocks
> unsigned software, wait for a signed release or use the web edition.
> Signing is planned (see [signing](docs/release/signing.md)).

## What it does

- **Organise pages** — open, merge, split, extract, insert, delete, rotate,
  reorder, duplicate, add blank pages, turn images into pages.
- **Read and annotate** — zoom, select text, add text and signature images
  (with background removal), fill in PDF forms.
- **Recognise text (OCR)** — make scanned pages searchable and copyable in
  English, French or both, **offline**; save the text, a searchable PDF, or
  an approximate Word/Excel file.
- **Compress** — lossless, balanced or strong (shrinks scans and photos).
- **Convert** — PDF to Word (.docx) or Excel (.xlsx); pages to PNG/JPEG.
- **Mark** — page numbers and text watermarks.
- **Undo / redo** every change; keyboard shortcuts; light and dark themes.

### Privacy in one paragraph

Your documents are processed on your computer or inside your browser tab.
They are never uploaded. The desktop app blocks all network access; the web
edition only downloads its own files. No analytics, advertising, crash
reports or automatic update checks. Details: [PRIVACY.md](PRIVACY.md).

### Good to know (honest limitations)

- **Visual signatures are not digital signatures.** Placing a signature
  image does not cryptographically sign the PDF. A PDF that already carries
  a digital signature loses its validity in any file PDF Manager exports
  (you are warned).
- **No password protection, no redaction** yet: drawing a black box over
  text does not remove it, so PDF Manager does not offer it as "redaction".
  Encrypted PDFs cannot be edited.
- **OCR** works best on clean, upright, printed text; confidence is an
  estimate, so check names, numbers and dates. Handwriting is not supported.
- **Word/Excel conversion is approximate** (see below).
- **Watermarks** mark a document; they do not protect it.
- Exported PDFs are rebuilt from pages: bookmarks and accessibility tags of
  the original are not kept.

---

## User guide

### Page editing
- Open one or more PDFs (drag-and-drop or browse) and preview pages in a
  thumbnail grid
- **Select** pages, **rotate** (left/right), **delete**, and **reorder** them by
  dragging thumbnails
- **Extraction**: save pages as a new PDF (`<name>_extraction.pdf`) while the
  current document stays unchanged. Either type pages and ranges in the
  *Pages to extract* box — `1-3, 7`, `10-` (to the end), `-4` (from the
  start), `5-2` (reversed) — or leave it empty to use the pages selected in
  the grid. **Select** highlights the typed pages in the grid first.
- **Keep only selected**: drop every page that is not selected
- **Merge** multiple PDFs (added files are appended to the working document)
- **Split** a PDF at chosen page boundaries (each part downloads separately)
- **Insert** pages from another PDF at a chosen position
- **Export** the edited document, applying the current order, rotations,
  deletions, annotations, and form entries
- **Duplicate** selected pages, and **Move earlier / Move later** — a
  keyboard-friendly alternative to dragging
- **Undo / redo** every change to the document (up to 50 steps; 25 on
  low-memory devices) with the ↶ ↷
  buttons in the header, `Ctrl+Z` / `Ctrl+Y`, or the *Edit* menu. This covers
  adding, deleting, rotating, reordering, inserting, *Keep only selected*,
  adding, moving, resizing, and formatting annotations, filling in form
  fields, and compressing. *Close document* starts afresh and clears the
  history.

### Document view (read, zoom, annotate)
Switch between the **Page grid** and the **Document** view with the toggle at
the top of the workspace (double-clicking a thumbnail also opens that page).
The Document view works like a regular PDF viewer:
- Continuous scrolling through all pages, with previous/next buttons and a
  page-number box
- **Zoom** from 25 % to 500 %: the − / + buttons, the zoom list (including
  *Fit width* and *Fit page*), `Ctrl` + mouse wheel or trackpad pinch
  (zooms around the pointer), and `Ctrl` + `+` / `−` / `0`
- Pages stay sharp at every zoom level, and their **text can be selected and
  copied**

### Annotate
In the Document view (or from the **Annotate** panel):
- **Text**: choose *Add text*, click where it should go, and type. Select a
  text to change its **font** (Helvetica, Times, Courier), **size** (− / + or
  type a value), **bold**, **italic**, and **colour** in the bar above the
  page; double-click it to edit the words. New texts reuse the last
  formatting.
- **Signature / image** (PNG, JPG, WebP, GIF, or BMP): it appears in the
  middle of the current page. Drag the **corner handles** to resize it
  (proportions kept; *Keep proportions* or `Shift` switches that), or the
  **edge handles** to reshape (stretch) it.
- **Remove background**: select a signature and choose *Remove background*
  to make the paper transparent, so only the strokes remain on the page. It
  works on scans and on phone photos (shadows and uneven lighting are
  treated as paper), keeps the ink's colour, and trims the empty margins
  without moving the signature. Adjust the **Strength** slider if traces of
  paper remain (higher) or faint strokes fade (lower), or choose *Restore
  original*.
- **Drag** any text or signature to move it; arrow keys nudge it (`Shift` for
  bigger steps) and `Delete` removes it.
- Text in other alphabets (Polish, Czech, Vietnamese, Greek, Cyrillic…) is
  written with an embedded Noto Sans font; characters no bundled font has
  (for example Chinese or emoji) are listed and the export stops, instead of
  turning into "?".
- Annotations stay editable (and undoable) until the document is exported,
  compressed, or converted, when they are drawn into the pages. On rotated
  pages they read upright.

### Fill in forms
Fillable PDF forms (text boxes, check boxes, radio buttons, drop-down and
list boxes) show their fields highlighted in blue in the Document view. Type,
tick, and choose directly on the page; every entry can be undone. On export
the values are written into the fields, which **stay fillable** in other PDF
readers.

### Recognise text (OCR)

Open the **Recognise text** tab, choose the pages (all, selected or a range),
the language (English, French, or both) and the quality (fast 200 dpi,
standard 300 dpi, high 400 dpi), then **Recognise text**. Pages that already
contain text are skipped unless you tick the option (which may duplicate
text). You can cancel at any time.

Results per page show a confidence value; low values are flagged. You can:
- correct the text, **copy** it or **save it as .txt** (UTF-8);
- **save a searchable PDF** — pages look exactly the same, with invisible
  text you can select and search;
- create **Word** or **Excel** files from the recognised text (approximate).

The desktop app includes the English and French models, so OCR works on a
computer that has never been online. In the web edition the engine (≈ 4 MB)
and each language pack (0.7–2.9 MB) are downloaded from the site the first
time; use **Offline use → Make available offline** to keep them.

### Compress

| Level | What it does |
|---|---|
| Lossless | Tidies the file structure and merges duplicate images; pages are unchanged |
| Balanced (150 dpi) | Also shrinks large images (JPEG); good for screen and ordinary printing |
| Strong (100 dpi) | Smallest files for e-mail or slow connections; images lose detail |

Text, drawings, forms and links are kept. If a level cannot make the file
smaller, the document is left unchanged. The result replaces the open
document (Undo brings it back); use **Export** to save it.

### Convert

- **PDF → Word (.docx)**: one Word page per PDF page (same size, orientation
  and margins), with paragraphs, headings, fonts, bold/italic, alignment,
  tables (merged cells, shading) and images.
- **PDF → Excel (.xlsx)**: one sheet per page; tables become cell grids and
  numbers (`1,234.50`, `(15)`, `12%`, `1 234,56`) are stored as numbers.
  Text from the PDF is never written as a spreadsheet formula.
- Scanned pages: run OCR first, then use *Word (from OCR)* / *Excel (from OCR)*.

### Page tools

Insert blank A4/Letter pages; add JPG/PNG/WebP/GIF/BMP images as pages
(camera details such as location are not copied); add page numbers
(`{n}` and `{total}` in the text); add a semi-transparent text watermark;
save pages as PNG or JPEG (several pages are zipped). Numbers and
watermarks read upright on rotated pages and can be undone.

### Keyboard shortcuts

Press **?** in the app (or click **Keyboard shortcuts** in the left menu) to
see this list. Shortcuts are ignored while typing in a text box. On macOS,
use ⌘ in place of Ctrl.

| Keys | Action |
|------|--------|
| `Ctrl` + `O` | Open or add a PDF |
| `Ctrl` + `Z` | Undo the last change |
| `Ctrl` + `Y` or `Ctrl` + `Shift` + `Z` | Redo |
| `Ctrl` + `A` | Select all pages |
| `Esc` | Clear the selection |
| `R` | Rotate selected pages right |
| `Shift` + `R` | Rotate selected pages left |
| `Delete` / `Backspace` | Delete selected pages |
| `Ctrl` + `E` | Extraction (page range or selected pages) |
| `Ctrl` + `S` | Download the edited PDF (a "Saved" notice confirms it) |
| `Ctrl` + `+` / `Ctrl` + `−` | Zoom in / out (Document view) |
| `Ctrl` + `0` | Actual size (Document view) |
| `?` | Show the shortcut list |

In the Document view, the page-grid keys (`Ctrl` + `A`, `R`, `Delete`, …)
are off so they never change pages you cannot see; `Delete`, arrow keys, and
`Enter` (edit text) act on the selected annotation instead, and `Esc`
deselects it.

### Desktop window menu

The desktop app has its own menu bar, in English or French to match the app
(it switches with the **EN | FR** toggle):

| Menu | Items |
|------|-------|
| File / Fichier | Open PDF… · Download edited PDF · Close document · Quit |
| Edit / Édition | Undo · Redo · Cut · Copy · Paste |
| View / Affichage | Actual size · Zoom in · Zoom out (of the document) · Full screen |
| Help / Aide | Keyboard shortcuts · Credits · Author's GitHub page |

### Languages (English / Français)
- The **Windows installer** opens with a language dialog (pre-selected from
  the Windows display language) so you can install in **English or French**.
- The app opens in the language chosen during installation. Without an
  installer choice (portable build, browser), it follows the operating-system
  language.
- Switch at any time with the **EN | FR** toggle in the top-right corner; the
  choice is remembered.

### Web edition offline

After the first visit the web edition opens without a connection. The
**Offline use** button at the bottom shows what is available offline, lets
you download OCR language packs, and **Remove offline data** deletes
everything the site stored (your own files are never stored). When a new
version is ready, a message lets you reload when convenient.

### Accessibility

Controls have text labels, forms have labels, the language of the page is
set for screen readers, progress and errors are announced, and page order
can be changed without dragging (*Move earlier / later*). A full WCAG 2.2
audit with screen readers has not been done yet; please report barriers.

---

## For developers

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 24 LTS (`.nvmrc`; ≥ 22.13 works) |
| npm | 10 or later |
| Windows 10/11 x64 | to build the Windows `.exe` files |

### Commands

```bash
npm ci                 # exact versions from package-lock.json
npm run dev            # browser, http://localhost:5173
npm run electron:dev   # desktop window
npm run lint && npm run typecheck && npm test
npm run build          # dist/ + THIRD-PARTY-NOTICES + build-meta/ (SBOM)
npm run test:e2e       # Playwright: Electron + web (run `npx playwright install chromium` once)
npm run bench:ocr      # OCR accuracy/speed report → docs/benchmarks/
npm run dist           # Windows portable + NSIS installer (unsigned unless configured)
```

`npm run assets` copies PDF.js, OCR and font files from `node_modules` into
`public/` and checks their SHA-256 digests against
`scripts/asset-digests.json` (it runs automatically before dev/build/test).

On Linux, E2E tests need Xvfb (`xvfb-run -a npm run test:e2e`); some tests use
Poppler's `pdftotext`/`pdfinfo` as independent checkers when installed.

### Architecture

```
src/
  pdf/            PDF logic, no React (pdf-lib, PDF.js)
    ocr/          OCR engine wrapper, rasteriser, text-layer writer, metrics
    compress*.ts  structural + image compression
    pageTools.ts  blank pages, images→PDF, page numbers, watermark
    limits.ts     resource budgets · inspect.ts PDF findings · filenames.ts
  components/     React UI (OcrPanel, ToolsPanel, OfflinePanel, Viewer…)
  hooks/          editor state with undo/redo, shortcuts
  i18n/           en.ts / fr.ts (key parity tested)
  pwa.ts          web edition service-worker client
electron/
  main.cjs        window, app:// protocol, session hardening
  security.cjs    pure, unit-tested security policy (URLs, CSP, IPC)
  preload.cjs     exposes setLanguage("en"|"fr") only
scripts/          asset copy + digests, notices/SBOM, service-worker template
e2e/              Playwright tests (Electron and web)
docs/             readiness record, security, ADRs, release and distribution guides
```

Security model and decisions: [threat model](docs/security/threat-model.md),
[ADRs](docs/adr/README.md). Release process:
[checklist](docs/release/checklist.md). Current evidence and gate status:
[distribution readiness](docs/distribution-readiness.md).

### Conversion details and limits

### Conversion is NOT lossless
PDF has no notion of paragraphs or tables, so conversion reconstructs them from
the page layout:

- **Tables** are found two ways: from the PDF's drawn ruling lines (bordered
  tables, with merged cells and cell shading), and from vertical whitespace
  alignment (borderless tables). Unusual tables — e.g. ones drawn only with
  background colours, or with heavily wrapped cells — may come out as text.
- **Text** is grouped into paragraphs using line spacing, indentation and line
  length; two-column pages are read column by column. Fonts are mapped to
  their family name (Word substitutes any font that isn't installed).
- **Not reproduced:** text colour, vector drawings and charts, diagonal or
  vertical text, headers/footers as Word header/footer parts.
- **Scanned pages** need OCR first (see above); otherwise they come
  through as images in Word and as empty sheets in Excel.

## Contributing, support, security

[CONTRIBUTING.md](CONTRIBUTING.md) · [SUPPORT.md](SUPPORT.md) ·
[SECURITY.md](SECURITY.md) · [CHANGELOG.md](CHANGELOG.md)

## Author and licence

Created and maintained by **[Dramane Bako](https://github.com/bakodramane)**.
Licensed under the [Apache License 2.0](LICENSE). Third-party components and
their licences are listed in `THIRD-PARTY-NOTICES.txt` shipped with every
build.
