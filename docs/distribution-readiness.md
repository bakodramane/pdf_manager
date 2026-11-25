# Distribution readiness — PDF Manager

Status as of 25 November 2026, branch `claude/inspiring-mendel-2ztgre`
(baseline: `main` at `f0cfc7a`, version 0.1.0). This document is the running
record of the distribution-readiness work: baseline, decisions, evidence and
what remains. Every "PASS" below is backed by a command that was run and its
output; anything that could not be executed here is marked **NOT VERIFIED**
with the reason.

## 1. Baseline (before changes)

| Item | Observed |
|---|---|
| Toolchain used | Node 22.23.5, npm 10.9.9, Linux x64 container (4 vCPU) |
| `npm ci` | exit 0; **35 audit findings (4 critical, 15 high, 16 moderate)** |
| `npm run lint` / `typecheck` / `test` / `build` | all exit 0; 81 unit tests in 10 files |
| Electron | 42.4.1 — release line **end of life** (supported: 43, 44, 45); 14 Electron advisories |
| Renderer loading | `file://` with `startsWith` dev-origin check; any `http(s)` link forwarded to `shell.openExternal` |
| CSP | none |
| Certificate handler | `certificate-error` called `preventDefault()` without a verdict |
| Main bundle | `index-*.js` 1.06 MB (376 KB gzip); PDF.js worker 1.38 MB; ExcelJS 0.94 MB (lazy) |
| Known gaps (README) | no OCR, structural-only compression, standard-font annotations ("?" for other characters), unsigned binaries |

## 2. What changed (by milestone)

| Milestone | Commit | Summary |
|---|---|---|
| Dependencies | `cac8973` | Electron 45.5.0, Vite 8, Vitest 5, PDF.js 6.5, ESLint 9 flat config, regenerated lockfile, PDF.js assets copied from `node_modules` |
| Electron boundary | `eb8e76a` | `app://` protocol, CSP, network/permission/download denial, navigation and window policy, IPC validation, fuses, security tests |
| Resource safety | `f53dac0` | adaptive limits, budgets, image sniffing, safe export names, signature/script/attachment warnings |
| OCR | `a5d4107` | offline EN/FR OCR, searchable PDF, text/Word/Excel outputs, benchmark |
| PDF features | `2ab95a3` | compression profiles, Unicode annotations, page tools |
| Web/PWA | `63f4891` | manifest, generated service worker, explicit OCR packs, update flow, PDF.js asset-URL fix |
| Release engineering | `cb9fd80` | CI, CodeQL, Dependabot, draft-release and Pages workflows, signing hook, SBOMs, notices |
| Docs and handover | this commit | documentation set, ADRs, distribution kit, version 0.2.0-beta.1 |

## 3. Inventory

### 3.1 Features (current)

Page operations (open, merge, split, extract, insert, delete, rotate, reorder
by drag **or** Move earlier/later buttons, duplicate, blank pages, images to
pages), document viewer with zoom and text selection, annotations (text with
Unicode fallback font, signature images with background removal), AcroForm
filling, compression (lossless / balanced / strong), PDF→Word/Excel, OCR
(English, French, both) with searchable PDF, text, OCR-assisted Word/Excel,
page numbers, text watermark, pages to PNG/JPEG, undo/redo, EN/FR UI, web
edition with offline support.

### 3.2 What is shipped (from the build, not from `package.json`)

`build-meta/bundled-packages.json` is written by the Vite build and lists the
packages actually present in the renderer and worker bundles. Together with
the files copied by `scripts/copy-assets.mjs` it feeds
`dist/THIRD-PARTY-NOTICES.txt` and `build-meta/sbom-shipped.cdx.json`
(CycloneDX 1.5). Current result: **208 packages, all permissive licences**
(MIT 177, ISC 12, Apache-2.0 7, BSD 3, 0BSD 2, OFL-1.1 fonts, Unlicense,
BlueOak-1.0.0, Zlib; JSZip is dual-licensed MIT/GPL-3.0 and used under MIT).
One package without licence metadata (`buffers@0.1.1`, Node-only dependency
of ExcelJS's unzipper) carries a reviewed override in the script.

Why every library is a `devDependency`: electron-builder copies
`dependencies` into the app archive. Everything the app needs is bundled by
Vite or copied into `dist/`, so `dependencies` must stay empty; a unit test
enforces this (`src/test/source-hygiene.test.ts`).

### 3.3 Runtime network behaviour

| Edition | Behaviour | Evidence |
|---|---|---|
| Desktop | No request leaves the app: CSP (`default-src 'none'`, `connect-src 'self' blob: data:`) **and** a session `webRequest` filter cancel everything but `app://pdf-manager`, `blob:` and `data:`. The only outbound action is opening an allow-listed HTTPS page (author/project) in the system browser after a click. No updater, telemetry or crash upload. | `e2e/electron.spec.ts` (fetch/WebSocket/image probes, `session.fetch` bypassing CSP), `e2e/electron-ocr.spec.ts` (request log during OCR: only `app:`/`blob:`/`data:`) |
| Web | Same-origin requests only (app files, PDF.js resources, fonts, OCR engine and models when used). Documents are never fetched or uploaded. | `e2e/web.spec.ts` (every request recorded; none outside the site), `e2e/web-pwa.spec.ts` |

Packet-level capture of the packaged Windows app on an isolated host:
**NOT VERIFIED** (no Windows host here).

### 3.4 Storage and temporary data

- Persisted: UI language (`localStorage`, key `pdfm.lang`). Web edition only:
  Cache Storage with application files and, on request, OCR packs.
- Never persisted: documents, page images, OCR text, signatures, outputs. No
  recent-files list, no autosave.
- Both Windows builds use Electron's default profile folder
  (`%APPDATA%\PDF Manager`) for Chromium state (GPU cache, preferences,
  `localStorage`); the portable build also extracts itself to a temporary
  folder at each start, so it is not "zero footprint" on a shared or USB
  setup (see `docs/distribution/portableapps.md`). The app stores no
  document data there, but Windows may page memory to disk and Chromium may
  use temporary files; no secure-erasure claim is made.
- Downloads are written only where the user chooses in the save dialog.

## 4. Security work (summary; details in `docs/security/`)

- Dependency audit: 35 → **6 moderate**, all build-time (`minimatch` inside
  electron-builder's macOS/universal and glob code paths with our own fixed
  patterns). Disposition in `docs/security/dependency-audit.md`.
- Threat model: `docs/security/threat-model.md`.
- Electron hardening: custom privileged scheme instead of `file://`;
  traversal-safe asset resolution; production CSP header and `<meta>`;
  navigation limited to the entry page; frames, webviews and new windows
  denied; permissions, HID/serial/USB and remote downloads denied; external
  links only to an allow-list; IPC sender and payload validation; DevTools
  disabled in production; explicit certificate rejection; fuses (RunAsNode,
  NODE_OPTIONS, `--inspect` off; ASAR integrity and ASAR-only loading on;
  `file://` extra privileges off), verified on a packaged build with
  `@electron/fuses read`.
- PDF handling: documents loaded from bytes only; XFA disabled; no PDF
  scripting sandbox loaded; findings (signatures, JavaScript, launch/submit
  actions, attachments, XFA) reported to the user; exported files are
  explicitly **not** described as sanitised.

## 5. Release-gate matrix

| Gate | Status | Evidence / reason |
|---|---|---|
| Lint, typecheck | **PASS** | `npm run lint` (0 warnings), `npm run typecheck` |
| Unit and integration tests | **PASS** | `npm test`: 207 tests, 17 files, 0 skipped |
| Electron E2E (security + OCR) | **PASS** (Linux, unpackaged, `--no-sandbox` as root in container) | `xvfb-run -a npx playwright test --project=electron`: 9 passed |
| Web E2E (sub-path, CSP, PWA) | **PASS** (Chromium 1.63 build) | `npx playwright test --project=web`: 5 passed |
| No exploitable critical/high runtime vulnerability | **PASS** | `npm audit`: 0 critical, 0 high; Electron 45.5.0 supported line |
| Production CSP | **PASS** | header (desktop) and meta (web); zero violations in E2E |
| No unintended network access during processing | **PASS** (desktop and web, automated); packet capture **NOT VERIFIED** | see 3.3 |
| No document data in caches/logs | **PASS** (web Cache Storage inspected in E2E; no logging of content in code) | `e2e/web-pwa.spec.ts` |
| Existing features (merge/split/…/Word/Excel) | **PASS** | unit tests + web E2E |
| Independent validation of outputs | **PASS** for OCR text layer (Poppler, pypdf, PDF.js), compression (Poppler `pdfinfo`, pixel comparison), stamps (Poppler bounding boxes), Office files (JSZip parsing) | test files cited in sections 6–7 |
| OCR offline EN/FR, CER/WER | **PASS** on synthetic corpus | `docs/benchmarks/ocr.md` |
| Compression ≥ 30 % on oversized scan (balanced) | **PASS** (52 %) | `src/pdf/compress.test.ts` |
| Accessibility (automated + manual keyboard/screen reader) | **NOT VERIFIED** | no axe run or screen-reader session in this environment; keyboard alternatives added (move buttons, labelled controls) |
| Windows portable + NSIS build | **NOT VERIFIED** here (Linux container, no Wine) | CI job `windows-package` builds both on `windows-latest` |
| Clean Win10/Win11 install/uninstall, no elevation, offline use, paths with accents | **NOT VERIFIED** | requires Windows hosts |
| Packaged app launch | **NOT VERIFIED** (Linux packaged build's fuses verified; GUI launch blocked: sandbox refuses root, creating a test user was not permitted) | |
| Authenticode signing | **BLOCKED** | no certificate or signing service; hook and fail-closed verification in place (`build/sign.cjs`, `scripts/verify-signatures.ps1`) |
| Checksums, provenance, SBOM | **PASS** (implemented; runs in release workflow); end-to-end CI run **NOT VERIFIED** (workflows not yet executed on GitHub) | `.github/workflows/release.yml` |
| Microsoft Store package | **DEFERRED** | `docs/distribution/microsoft-store.md` |
| GitHub Pages deployment | **NOT VERIFIED** | workflow ready (`pages.yml`, manual); requires enabling Pages |
| Password protection (P2) | **DEFERRED** | ADR 0006 |
| Genuine redaction (P2) | **DEFERRED** | ADR 0007 |
| Cryptographic PDF signatures (P2) | **DEFERRED** | ADR 0008 |
| Licences, notices, SBOM | **PASS** | `scripts/third-party-notices.mjs` |
| Maintainer approval to publish | **PENDING** | — |

## 6. OCR evidence

See `docs/benchmarks/ocr.md`. Summary: on seven synthetic fixtures (English,
French accents, mixed, 90°/270° page rotation, low contrast, 100 dpi with 2°
skew) CER and WER were 0 at 300 dpi; the text layer read back by Poppler
`pdftotext` and `pypdf` matched; the searchable PDF renders pixel-identical
to the scan; word boxes land within a few points of the source text. Desktop
E2E ran OCR inside Electron with a request log showing no external traffic.
These are clean synthetic inputs; real scans (photos, handwriting, complex
layouts) will do worse and are not covered by these numbers.

## 7. Compression evidence

Fixture (`src/pdf/compress.test.ts`): A4 300 dpi noisy JPEG scan, a second
identical copy, a 2400 px PNG with alpha, vector drawing, text, form field,
link annotation, rotated page and an unsupported CMYK image.

| Profile | Result |
|---|---|
| Lossless | renders pixel-identical; duplicate images merged |
| Balanced (150 dpi, JPEG q0.75) | 7.59 MB → 3.62 MB (−52 %); text, form value, link, soft mask and CMYK image preserved; mean pixel difference < 6/255 |
| Strong (100 dpi, q0.6) | smaller than balanced |

Gains depend on the document: text-only files shrink little, and the app
keeps the original when a profile does not reduce the size.

## 8. Performance and size

| Measure | Baseline | Now |
|---|---|---|
| Main JS (gzip) | 376 KB | 413 KB (OCR, compression codec, page-image export, fontkit and Office writers load on demand) |
| `dist/` total | 6.2 MB | 27 MB (OCR engine 3 × 3.9 MB WASM builds, models 3.7 MB, fonts 2.5 MB) |
| Web first visit (shell, no OCR) | — | ≈ 8 MB before compression (PDF.js worker, CMaps on demand, standard fonts); OCR adds ≈ 4 MB engine + 0.7–2.9 MB per language, only when used |
| OCR time per A4 page, 300 dpi | — | 1.3–2.3 s (Node, 4 vCPU container; single worker) |

Executable/installer sizes, startup time and memory on a 4 GB Windows
machine: **NOT VERIFIED** (no Windows hardware here). Expect the installer to
grow by roughly the OCR and font assets (≈ 20 MB uncompressed, less after
NSIS compression).

## 9. Known limitations and deferrals

- Deferred P1 items: freehand ink, highlight/underline and shape
  annotations; document text search; batch jobs; flatten-forms export;
  bookmark editing; image watermarks; crop. They are not exposed in the UI.
- OCR needs upright pages (the LSTM-only engine has no orientation
  detection); handwriting is out of scope.
- pdf-lib's font subsetter corrupts Noto Sans outlines, so Unicode
  annotations embed the full font (≈ 600 KB per style used); English/French
  text keeps using the standard fonts at no size cost. The invisible OCR text
  layer uses a subset (outlines are never painted).
- Exported PDFs are rebuilt: existing digital signatures are invalidated
  (the user is warned); bookmarks/outlines and tagged structure are not
  preserved by the page-copy model.
- A separate bilingual landing page was not built: `README.md` /
  `README.fr.md` serve as the product pages, and GitHub Pages hosts the web
  app itself. Download buttons must point to real release assets only once a
  release exists.
- Real screenshots from a release build are not yet in the README.
- Windows 10 reached end of support in October 2025; the app may run there,
  but this is not a statement that the OS is secure.

## 10. Maintainer actions

1. Review and merge this branch (no merge or publish was done).
2. Decide on code signing (see `docs/release/signing.md`) and configure the
   `release-signing` environment; until then releases are labelled
   UNSIGNED.
3. Run `Release (draft)` from Actions, test the artifacts on clean Windows
   10/11 machines (checklist in `docs/release/checklist.md`), then publish.
4. Enable GitHub Pages (Source: GitHub Actions) and run the Pages workflow.
5. Enable private vulnerability reporting (Settings → Security) so
   `SECURITY.md` points to a working channel.
6. Optional channels: `docs/distribution/`.
