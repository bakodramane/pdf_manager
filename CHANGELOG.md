# Changelog

All notable changes. Versions follow [SemVer](https://semver.org/);
pre-releases are marked `-beta.n`.

## [0.2.0-beta.1] — unreleased (prepared, not published)

### Security
- Electron 42 (end of life) → 45.5.0; toolchain upgraded (Vite 8, Vitest 5,
  ESLint 9, PDF.js 6.5); `npm audit` 35 findings → 6 moderate build-time.
- Desktop renderer served from a private `app://` scheme with a strict
  Content Security Policy; all network requests, permissions, device access,
  new windows, frames and remote downloads denied; external links limited to
  an allow-list; IPC sender/payload validation; DevTools off in production.
- Electron fuses: no Node mode, no `NODE_OPTIONS`, no inspector; ASAR
  integrity and ASAR-only loading.
- Resource limits (file size, total memory, pages, image pixels, render DPI),
  image type checks before decoding, safe export file names.
- Warnings when a PDF is digitally signed, contains scripts/actions,
  attachments or XFA.

### Added
- Offline text recognition (OCR) in English, French or both: searchable PDF,
  editable text, copy/.txt export, Word/Excel from recognised text,
  confidence flags, cancel and retry.
- Compression levels: lossless, balanced (150 dpi) and strong (100 dpi) with
  real image downsampling.
- Page tools: blank pages, images to pages, page numbers, text watermark,
  save pages as PNG/JPEG, duplicate pages, Move earlier/later buttons.
- Annotation text beyond Western European characters (embedded Noto Sans);
  unsupported characters are reported instead of becoming "?".
- Web edition: installable, works offline after the first visit, OCR
  language packs downloaded only on request, user-controlled updates.
- CI, CodeQL, Dependabot, draft-release workflow with checksums, SBOMs and
  build provenance; Authenticode signing hook (fails closed when required).
- Documentation: privacy, security, support, contributing, threat model,
  architecture decisions, release and distribution guides, French README.

### Fixed
- PDF.js CMaps, standard fonts and decoders were requested from a wrong
  path inside the PDF.js worker.

### Known limitations
- Windows binaries are **unsigned** until a signing route is chosen.
- Not yet tested on clean Windows 10/11 machines in this cycle.
- No password protection, redaction or digital (cryptographic) signatures
  (see `docs/adr/`).

## [0.1.0]
- First version: page editing, merge/split/extract, annotations, signature
  images with background removal, form filling, Word/Excel conversion,
  English/French interface, Windows portable and installer builds.
