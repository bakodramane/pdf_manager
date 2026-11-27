# Contributing

Thank you for helping. Contributions in English or French are welcome.

## Ground rules

- Keep the app **local-first**: no network calls during document processing,
  no telemetry, no accounts, no CDNs.
- Every user-facing string goes in **both** `src/i18n/en.ts` and
  `src/i18n/fr.ts` (a test checks key and placeholder parity).
- Be honest in the UI and docs: do not describe visual signatures,
  watermarks or overlays as security features.
- Add tests for behaviour changes; use synthetic fixtures only — never real
  personal or confidential documents.

## Development

Node 24 (see `.nvmrc`; Node ≥ 22.13 works), then:

```bash
npm ci
npm run test:check-prereqs   # checks Poppler (pdftotext / pdfinfo)
npm run dev                  # browser
npm run electron:dev         # desktop window
npm run lint && npm run typecheck && npm test
npm run build && npm run electron:install && npx playwright install chromium && npm run test:e2e
```

### External test prerequisites (Poppler & Xvfb)

Poppler (`pdftotext`, `pdfinfo`) is a **development/testing dependency only**
for independent verification of generated PDFs; end users of the portable,
NSIS and web editions never need it.

- **Windows (portable, no admin rights):** download `Release-*.zip` from
  [oschwartz10612/poppler-windows](https://github.com/oschwartz10612/poppler-windows/releases),
  extract to `%USERPROFILE%\Tools\Poppler`, and either add `...\Library\bin`
  to your user `PATH` or set `PDFTOTEXT_PATH` to `pdftotext.exe` (or install
  via `scoop install poppler` or `winget install -e --id oschwartz10612.Poppler`).
- **Linux:** `sudo apt-get update && sudo apt-get install -y poppler-utils xvfb`
  (run E2E with `xvfb-run -a npm run test:e2e`; containers running as root also
  need `E2E_NO_SANDBOX=1`).
- **macOS:** `brew install poppler`.

Verify your setup with `npm run test:check-prereqs` (set `PDFM_REQUIRE_POPPLER=1`
to enforce Poppler during local unit tests just as CI does).

### Corporate networks (Electron / Playwright downloads)

If `npm run electron:install` or `npx playwright install chromium` fails behind
a corporate TLS proxy, trust the OS certificate store with
`NODE_USE_SYSTEM_CA=1` (Node ≥ 22.15 / 24 LTS) or pass an approved PEM bundle
via `NODE_EXTRA_CA_CERTS=/path/to/approved-ca.pem`. **Never** disable TLS
verification (`NODE_TLS_REJECT_UNAUTHORIZED=0` or `strict-ssl=false`).

Upgrading OCR, font or PDF.js assets changes their digests: run
`npm run assets -- --update-digests` and explain the upgrade in the PR.

## Pull requests

- Small, focused PRs with a clear description; fill in the template.
- CI must pass (lint, types, unit, E2E, audit, CodeQL).
- By contributing you agree your work is licensed under Apache-2.0.
