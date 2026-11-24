# PDF Manager

A private, **100% client-side** PDF editor, available in **English and French**.
Everything runs on your device — no backend, no network calls, no telemetry.
Your files never leave your machine.

Created by **[Dramane Bako](https://github.com/bakodramane)**.

Built with Vite + React + TypeScript, [pdf-lib](https://pdf-lib.js.org/) for PDF
manipulation, and [PDF.js](https://mozilla.github.io/pdf.js/) for rendering page
previews. The Windows desktop app is packaged with Electron.

## Features

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
- **Undo / redo** every change to the document (up to 50 steps) with the ↶ ↷
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
- **Drag** any text or signature to move it; arrow keys nudge it (`Shift` for
  bigger steps) and `Delete` removes it.
- Annotations stay editable (and undoable) until the document is exported,
  compressed, or converted, when they are drawn into the pages. On rotated
  pages they read upright.

### Fill in forms
Fillable PDF forms (text boxes, check boxes, radio buttons, drop-down and
list boxes) show their fields highlighted in blue in the Document view. Type,
tick, and choose directly on the page; every entry can be undone. On export
the values are written into the fields, which **stay fillable** in other PDF
readers.

### Compress
- Re-packs the PDF structure using object streams

### Convert
- **PDF → Word (.docx)**: one Word page per PDF page (same size, orientation,
  and margins), with paragraphs, headings, fonts, bold/italic, alignment,
  indentation, spacing, tables (incl. merged cells and shading), and images
- **PDF → Excel (.xlsx)**: one sheet per page; tables become real cell grids
  with merged cells, borders, and shading, and numbers (`1,234.50`, `(15)`,
  `12%`, `$9.99`, `1 234,56`) are stored as numbers with a matching format

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

### Credits

The **Credits** item at the bottom of the left menu (and *Help → Credits* in
the desktop app) opens a box with the app version, the author (**Dramane
Bako**, with a link to [github.com/bakodramane](https://github.com/bakodramane)),
the libraries used, and the licence.

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

---

## Building the app from source

### 1. Prerequisites

| Tool | Version | Check with |
|------|---------|------------|
| [Node.js](https://nodejs.org/) (includes npm) | 20 LTS or 22 LTS | `node -v` and `npm -v` |
| [Git](https://git-scm.com/) | any recent version | `git --version` |
| Windows | 10 or 11 (x64), to build the Windows `.exe` files | — |

Building the Windows installers on Linux or macOS also works, but requires
[Wine](https://www.winehq.org/); building on Windows is the simplest route.

### 2. Get the code and install dependencies

```bash
git clone https://github.com/bakodramane/pdf_manager.git
cd pdf_manager
npm ci
```

`npm ci` installs the exact versions pinned in `package-lock.json` (including
the Electron binary, about 100 MB, downloaded once). Use `npm install` instead
if you intend to change dependencies.

> **Windows PowerShell tip:** if PowerShell refuses to run `npm` with a
> "running scripts is disabled" error, use `npm.cmd` in place of `npm`
> (for example `npm.cmd ci`), or run the commands from *Command Prompt*.

### 3. Check that everything works (optional but recommended)

```bash
npm run typecheck
npm run lint
npm test
```

### 4. Try the app before packaging it

```bash
npm run dev            # in the browser: open the printed http://localhost:5173 URL
npm run electron:dev   # as a desktop window (Vite dev server + Electron)
```

Stop either with `Ctrl+C`.

### 5. Build the Windows desktop app

```bash
npm run dist             # builds the installer and the portable .exe in one pass
npm run dist:installer   # bilingual (EN/FR) NSIS installer only
npm run dist:portable    # portable .exe only
```

Each command first runs `npm run build` (type-check + production web build
into `dist/`), then packages it with
[electron-builder](https://www.electron.build/). The results land in
`release/`:

| File | Type | Size (approx.) |
|------|------|----------------|
| `release/PDF Manager-0.1.0-Setup.exe`    | Per-user installer (English/French) | ~82 MB |
| `release/PDF Manager-0.1.0-portable.exe` | Portable single file, no installation | ~82 MB |

The version number in the file names comes from `"version"` in `package.json`.

### 6. Install and run

- **Installer:** double-click `PDF Manager-<version>-Setup.exe`, pick
  *English* or *Français* in the first dialog, and follow the wizard. It
  installs into `%LOCALAPPDATA%\Programs\PDF Manager` without administrator
  rights, and creates Start Menu and Desktop shortcuts.
- **Portable:** copy `PDF Manager-<version>-portable.exe` anywhere (even a USB
  drive) and double-click it.

The executables are unsigned, so Windows SmartScreen shows *"Windows protected
your PC"* on first run: click **More info**, then **Run anyway** (see below).

### 7. Publish a release (optional)

`release/` is **git-ignored**: the installers are around 80–100 MB and the
unpacked Electron binary is over 200 MB, above GitHub's 100 MB per-file limit.
Attach the `.exe` files to a
[GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
instead (assets can be up to 2 GB):

```bash
gh release create v0.1.0 "release/PDF Manager-0.1.0-Setup.exe" "release/PDF Manager-0.1.0-portable.exe"
```

### Building the web version only

```bash
npm run build      # outputs static files to dist/
npm run preview    # serves dist/ locally to check the production build
```

`dist/` is fully static — open it from any local static file server. It makes
no network requests at runtime.

### Troubleshooting the build

| Problem | Fix |
|---------|-----|
| `npm ci` fails while downloading Electron (proxy/firewall) | Set a mirror, e.g. `set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` (Command Prompt), then rerun `npm ci` |
| `EPERM` / "file is locked" during `npm run dist` | Close any running PDF Manager window and antivirus scans of `release/`, delete `release/`, and rerun |
| `npm run dist` on Linux/macOS fails on `wine` | Install Wine, or build on Windows |
| Out-of-date or broken `node_modules` | Delete `node_modules/` and rerun `npm ci` |

### All npm commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the Vite dev server (browser) |
| `npm run electron:dev` | Start Vite + Electron side by side |
| `npm run build` | Type-check and produce a production web build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run dist` | Build the Windows installer + portable `.exe` into `release/` |
| `npm run dist:installer` | Build the Windows installer only |
| `npm run dist:portable` | Build the portable `.exe` only |
| `npm run lint` | Run ESLint (zero warnings allowed) |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run the unit test suite (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

---

## Desktop app details

Both Windows artifacts run **without administrator rights** and make **zero
network calls** at runtime. The build keeps only the en-US and fr Chromium
locale packs, strips source maps, and uses maximum compression to keep the
artifacts small.

### Portable .exe

- **No installation needed.** Copy it to any folder or USB drive and double-click.
- Writes user data (window state, etc.) next to itself or to a temp profile.
- Requires no admin rights, triggers no UAC prompt.

### Per-user NSIS installer

- Bilingual wizard (English / French).
- Publisher **D.Bako**, shown in *Apps & features*, as *Company* in the
  `.exe` properties, and as the Start Menu folder name. It comes from
  `"author": { "name": "D.Bako" }` in `package.json`; the copyright line
  (*Copyright © 2026 Dramane Bako*) is set in `electron-builder.yml`.
- Installs into **`%LOCALAPPDATA%\Programs\PDF Manager`** (no admin, no UAC).
- Creates Start Menu and Desktop shortcuts.
- Provides a standard uninstaller under *Apps & features* (user scope).

### SmartScreen warning (expected)

The executables are **unsigned** (no code-signing certificate). Windows SmartScreen
will show a blue *"Windows protected your PC"* dialog on first run. This is expected
for private unsigned builds. To proceed:

1. Click **More info**.
2. Click **Run anyway**.

SmartScreen does not block the app permanently; it only asks once per executable.

### Renderer security model

| Setting | Value |
|---------|-------|
| `nodeIntegration` | `false` |
| `contextIsolation` | `true` |
| `sandbox` | `true` |
| External navigation | blocked (`will-navigate`) |
| New windows | denied; `https://` links (the author credit) open in the default browser |
| Preload bridge | exposes one function, `window.pdfManager.setLanguage(lang)`, so the menu can follow the UI language; the main process only accepts `en`/`fr` from its own window |

The renderer has no access to Node.js APIs. Menu commands reach the page as a
`pdfmanager:menu` DOM event dispatched by the main process (with a user
gesture, so *File → Open…* may open the file picker); only a fixed list of
command names is ever sent. Menu shortcuts are shown but not registered, so
each key press is handled once, by the page. File exports use the in-browser
Blob download — no native save dialog.

## Architecture

PDF logic is kept strictly separate from UI:

```
src/
  pdf/                 # PDF logic — no React
    types.ts           # PdfSource / PageRef / annotation / form data model
    loader.ts          # file validation + loading
    operations.ts      # pure page-list ops (delete/rotate/reorder/extract/split/insert)
    assemble.ts        # rebuild + download output PDF (pdf-lib)
    render.ts          # page rendering via PDF.js (web worker)
    pageInfo.ts        # page boxes + fillable form widgets (PDF.js)
    annotations.ts     # annotation geometry + drawing into pages (tested)
    forms.ts           # form filling + keeping fields fillable (tested)
    compress.ts        # object-stream re-packing
    extract.ts         # PDF.js page → text chunks, ruling lines, fills, images
    layout.ts          # layout analysis: lines, paragraphs, tables (pure, tested)
    convert.ts         # layout → docx / xlsx writers (lazy-loaded)
    errors.ts          # coded errors, translated by the UI
    *.test.ts          # unit tests
  i18n/
    en.ts / fr.ts      # UI strings (same keys, checked by a test)
    index.ts           # language detection, translate(), useI18n()
    I18nProvider.tsx   # React provider + language persistence
  hooks/
    useEditor.ts       # central editor state + actions, with undo/redo
    history.ts         # pure undo/redo history (tested)
    shortcuts.ts       # key → action mapping (tested)
    useShortcuts.ts    # window keyboard listener
  components/          # React components + inline SVG icons
    Viewer.tsx         # document view: zoom, text layer, annotations, forms
  desktop.ts           # bridge to the Electron menu (no-op in the browser)
  App.tsx              # layout, tool panels, async/error orchestration
electron/
  main.cjs             # window, security hardening, installer language
  menu.cjs             # bilingual window menu template
  preload.cjs          # exposes setLanguage() to the page, nothing else
build/
  installer.nsh        # NSIS hook: saves the installer language for the app
  icon.ico / icon.png  # app, shortcut, and installer icon
public/
  icon.png             # window icon, favicon, and in-app logo
```

The editor models a document as an ordered list of **page references**, each
pointing back to a loaded source PDF. Reorder/delete/insert/merge are simple
immutable array operations; the output is rebuilt with pdf-lib only on export.
Annotations live on their page reference (so they follow the page when it is
moved or rotated) and form values are kept per source file; both are part of
the undo history and are written into the PDF only when it is assembled.

## Robustness

- Validates file type, non-empty files, and a 200 MB size ceiling
- Detects corrupted and password-protected PDFs with clear messages
- Guards against empty selections and empty-document export
- Every async operation shows a loading overlay and surfaces errors as a toast
- PDF parsing/rendering runs in a **web worker** to keep the UI responsive

## Known limitations

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
- **No OCR.** Scanned pages come through as images in Word and as empty
  sheets in Excel.

### Compression
pdf-lib cannot re-encode embedded images. Compression re-packs the document
structure (object streams), which helps PDFs produced by office software but may
yield little on image-heavy files. The reported percentage reflects the actual
before/after size.

### Annotation and forms
- Text annotations use the PDF standard fonts (Helvetica, Times, Courier),
  which cover Western European characters; other characters are replaced
  with "?" in the exported file.
- Signature fields (digital signatures), push buttons, and form scripts
  (calculations, validation) are not supported. Field values are written with
  Helvetica; readers that rebuild appearances may show another font.

## Future improvements

- Free rotation of annotations, and drawing (ink) and highlight tools
- Real image down-sampling for stronger compression
- Optional OCR (e.g. tesseract.js) for scanned-PDF conversion
- Text colour and header/footer detection in Word conversion
- Per-page (not just whole-document) convert/compress

## Author

PDF Manager is created and maintained by
**[Dramane Bako](https://github.com/bakodramane)**.

## Privacy

No analytics, no network requests, no storage beyond your browser tab. Closing
the tab discards everything. This is by design.
