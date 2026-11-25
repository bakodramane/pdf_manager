# Threat model

## Assets

1. The user's documents, images, signatures and outputs (confidentiality and
   integrity).
2. The user's computer (the app must not become a way to run code or reach
   files).
3. The distributed binaries and web files (integrity, authenticity).

## Trust boundaries

```
 untrusted PDF / image files ──► renderer (sandboxed Chromium, no Node)
                                   │  PDF.js worker, OCR worker (WASM)
                                   │  narrow preload bridge: setLanguage("en"|"fr")
                                   ▼
                               Electron main process ──► OS (save dialog, system browser for allow-listed links)
 web edition: browser sandbox + same-origin service worker (app files only)
```

## Threats and mitigations

| # | Threat | Mitigation | Test |
|---|---|---|---|
| T1 | Malicious PDF exploits the parser/renderer | Supported Electron/Chromium; PDF.js 6.5 in a worker; renderer sandbox, context isolation, no Node; fuses block Node-mode/inspector | `electron.spec.ts` prefs and Node-absence checks |
| T2 | Embedded PDF JavaScript, launch/submit/import actions, XFA | Never executed: no PDF.js scripting sandbox, XFA disabled, link annotations are not followed in-app; findings shown to the user | `safety.test.ts` (detection) |
| T3 | PDF/links navigate the app to a hostile page | Navigation limited to `app://pdf-manager/index.html`; frames, webviews, new windows denied; external links only for an HTTPS allow-list via the system browser | `security.test.ts`, `electron.spec.ts` |
| T4 | Exfiltration of document data | CSP `default-src 'none'`, `connect-src 'self' blob: data:`; session filter cancels every other request (also checked with `session.fetch`, which bypasses the CSP); no telemetry/updater | `electron.spec.ts`, `electron-ocr.spec.ts`, `web.spec.ts` |
| T5 | Renderer reads local files | No `file://` (custom `app://` scheme serving only `dist/`, traversal and symlink checks); `grantFileProtocolExtraPrivileges` fuse off | `security.test.ts`, `electron.spec.ts` |
| T6 | Abuse of IPC | One channel; sender must be our window's main frame on the app origin; payload must be `en`/`fr`; menu commands are a fixed list sent as a constant script | `security.test.ts` |
| T7 | Device/permission abuse (camera, location, clipboard read, USB/HID/serial) | All denied except clipboard **write** from the app origin | `electron.spec.ts` |
| T8 | Resource exhaustion (huge files, decompression bombs, long jobs) | Size/page/pixel/DPI budgets, image header checks before decoding, one page at a time for OCR/export, timeouts, cancellation | `safety.test.ts`, `compress.test.ts` |
| T9 | Disguised file names (bidi override, reserved names, traversal) in exports | `sanitizeStem`/`deriveName` | `safety.test.ts` |
| T10 | Formula injection in Excel exports | Values are written as cell strings/numbers through ExcelJS; nothing is written as a formula | existing `convert.test.ts` (numbers), code review |
| T11 | Users misled about security features | Visible signature ≠ digital signature; watermark ≠ protection; no fake redaction or encryption (ADRs 0006–0008); exported PDFs not described as sanitised; signatures invalidated on export are announced | UI strings, docs |
| T12 | Tampered app files | ASAR integrity fuse + ASAR-only loading; Authenticode (once configured); SHA-256 checksums and build provenance on releases | `@electron/fuses read`, release workflow |
| T13 | Supply chain | Lockfile + `npm ci`; audit gate; Dependabot; CodeQL; actions pinned by SHA; OCR/font assets digest-pinned; release jobs without caches; signing only in a protected environment | workflows |
| T14 | Web edition caching sensitive data | Service worker caches only same-origin app files; documents are never fetched so never cached; reset button | `web-pwa.spec.ts` |

## Residual risks

- Chromium/PDF.js zero-days: mitigated by sandboxing and prompt updates, not
  eliminated.
- `style-src 'unsafe-inline'` is required for React `style` attributes;
  scripts remain strictly `'self'`.
- `'wasm-unsafe-eval'` is required for PDF.js decoders and the OCR engine
  (WebAssembly compilation only; JavaScript `eval` stays blocked).
- On GitHub Pages the CSP is a `<meta>` tag: `frame-ancestors` cannot be
  enforced that way and workers get no CSP header. Clickjacking risk is low
  (no account, no state to change) but documented.
- The portable build writes Chromium profile data to a temporary or adjacent
  folder; on shared computers users should close the app and delete exported
  files they no longer need.
- Exported PDFs may still contain scripts/attachments that existed in the
  source; other PDF readers may act on them.
