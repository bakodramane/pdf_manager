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
npm run dev            # browser
npm run electron:dev   # desktop window
npm run lint && npm run typecheck && npm test
npm run build && npx playwright install chromium && npm run test:e2e
```

E2E on Linux needs Xvfb (`xvfb-run -a npm run test:e2e`) and Poppler
(`pdftotext`) for some checks. Running as root (containers) needs
`E2E_NO_SANDBOX=1`.

Upgrading OCR, font or PDF.js assets changes their digests: run
`npm run assets -- --update-digests` and explain the upgrade in the PR.

## Pull requests

- Small, focused PRs with a clear description; fill in the template.
- CI must pass (lint, types, unit, E2E, audit, CodeQL).
- By contributing you agree your work is licensed under Apache-2.0.
