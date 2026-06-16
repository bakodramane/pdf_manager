# PDF Manager

A private, **100% client-side** PDF editor. Everything runs in your browser —
no backend, no network calls, no telemetry. Your files never leave your machine.

Built with Vite + React + TypeScript, [pdf-lib](https://pdf-lib.js.org/) for PDF
manipulation, and [PDF.js](https://mozilla.github.io/pdf.js/) for rendering page
previews.

## Features

### Page editing
- Open one or more PDFs (drag-and-drop or browse) and preview pages in a
  thumbnail grid
- **Select** pages, **delete**, **rotate** (left/right), **extract** (keep only
  selected), and **reorder** by dragging thumbnails
- **Merge** multiple PDFs (added files are appended to the working document)
- **Split** a PDF at chosen page boundaries (each part downloads separately)
- **Insert** pages from another PDF at a chosen position
- **Export** the edited document, applying the current order, rotations, and
  deletions

### Annotate
- Add **text** at a chosen page and position (X/Y as fractions of the page)
- Overlay a **signature / image** (PNG or JPG)

### Compress
- Re-packs the PDF structure using object streams

### Convert
- **PDF → Word (.docx)** and **PDF → Excel (.xlsx)** via text-layer extraction

## Desktop builds (Electron)

The app ships as two Windows artifacts built with [electron-builder](https://www.electron.build/).
Both run **without administrator rights** and make **zero network calls** at runtime.

### Build the artifacts

```bash
npm run dist             # builds both portable + installer in one pass
npm run dist:portable    # portable .exe only
npm run dist:installer   # NSIS installer only
```

Artifacts land in `release/`:

| File | Type | Size (approx.) |
|------|------|----------------|
| `PDF Manager-0.1.0-portable.exe` | Portable single-file | ~89 MB |
| `PDF Manager-0.1.0-Setup.exe`    | Per-user NSIS installer | ~100 MB |

### Portable .exe

- **No installation needed.** Copy it to any folder or USB drive and double-click.
- Writes user data (window state, etc.) next to itself or to a temp profile.
- Requires no admin rights, triggers no UAC prompt.

### Per-user NSIS installer

- Installs into **`%LOCALAPPDATA%\Programs\PDF Manager`** (no admin, no UAC).
- Creates Start Menu and Desktop shortcuts.
- Provides a standard uninstaller under Add/Remove Programs (user scope).

### SmartScreen warning (expected)

The executables are **unsigned** (no code-signing certificate). Windows SmartScreen
will show a blue *"Windows protected your PC"* dialog on first run. This is expected
for private unsigned builds. To proceed:

1. Click **More info**.
2. Click **Run anyway**.

SmartScreen does not block the app permanently; it only asks once per executable.

### Develop with Electron

```bash
npm run electron:dev   # starts Vite dev server + Electron side-by-side
```

The browser dev workflow (`npm run dev`) is unchanged.

### Renderer security model

| Setting | Value |
|---------|-------|
| `nodeIntegration` | `false` |
| `contextIsolation` | `true` |
| `sandbox` | `true` |
| External navigation | blocked (`will-navigate`) |
| New windows | denied (`setWindowOpenHandler`) |

The renderer has no access to Node.js APIs. File exports use the existing
in-browser Blob download — no native save dialog (avoids IPC complexity for
a single-user private app).

---

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server (prints a localhost URL)
```

Open the printed URL, drop in a PDF, and start editing.

### Available commands

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Start the Vite dev server                     |
| `npm run build`     | Type-check and produce a production build in `dist/` |
| `npm run preview`   | Serve the production build locally            |
| `npm run lint`      | Run ESLint (zero warnings allowed)            |
| `npm run typecheck` | Type-check without emitting                   |
| `npm run test`      | Run the unit test suite (Vitest)              |

### Production build

```bash
npm run build        # outputs static files to dist/
npm run preview      # preview the built app locally
```

`dist/` is fully static — open it from any local static file server. It makes no
network requests at runtime.

## Architecture

PDF logic is kept strictly separate from UI:

```
src/
  pdf/                 # PDF logic — no React
    types.ts           # PdfSource / PageRef data model
    loader.ts          # file validation + loading
    operations.ts      # pure page-list ops (delete/rotate/reorder/extract/split/insert)
    assemble.ts        # rebuild + download output PDF (pdf-lib)
    render.ts          # page rendering via PDF.js (web worker)
    overlay.ts         # text + image/signature overlay
    compress.ts        # object-stream re-packing
    convert.ts         # PDF → docx / xlsx (lazy-loaded)
    *.test.ts          # unit tests
  hooks/
    useEditor.ts       # central editor state + actions
  components/          # presentational React components
  App.tsx              # layout, tabs, async/error orchestration
```

The editor models a document as an ordered list of **page references**, each
pointing back to a loaded source PDF. Reorder/delete/insert/merge are simple
immutable array operations; the output is rebuilt with pdf-lib only on export.

## Robustness

- Validates file type, non-empty files, and a 200 MB size ceiling
- Detects corrupted and password-protected PDFs with clear messages
- Guards against empty selections and empty-document export
- Every async operation shows a loading overlay and surfaces errors as a toast
- PDF parsing/rendering runs in a **web worker** to keep the UI responsive

## Known limitations

### Conversion is NOT lossless
PDF → Word/Excel uses **text-layer extraction only**. This is a hard limit of
browser-only conversion:

- **No OCR.** Scanned or image-only PDFs (no embedded text) produce little or
  nothing.
- **No layout fidelity.** Fonts, colors, images, columns, and exact positioning
  are not preserved. Word output is plain paragraphs grouped by visual lines.
- **Excel columns are inferred** by clustering text x-positions — good for
  genuinely tabular PDFs, rough for free-form prose (which lands in column A).

Treat conversion as "get the text out in a usable form," not a faithful copy.

### Compression
pdf-lib cannot re-encode embedded images. Compression re-packs the document
structure (object streams), which helps PDFs produced by office software but may
yield little on image-heavy files. The reported percentage reflects the actual
before/after size.

### Annotation
Text/image overlays use absolute X/Y fractions (no on-canvas drag placement),
and text uses the standard Helvetica font.

## Future improvements

- On-canvas drag placement for annotations and signatures
- Real image down-sampling for stronger compression
- Optional OCR (e.g. tesseract.js) for scanned-PDF conversion
- Per-page (not just whole-document) convert/compress
- Keyboard shortcuts and undo/redo

## Privacy

No analytics, no network requests, no storage beyond your browser tab. Closing
the tab discards everything. This is by design.
