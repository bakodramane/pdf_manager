# 0001 — Serve the desktop renderer from a private `app://` scheme

**Context.** The app loaded `dist/index.html` from `file://`. A `file://`
page has a weak origin (`null`/`file://`), cannot be given a meaningful CSP
`'self'`, and navigation checks used `startsWith`. Electron recommends a
custom protocol.

**Decision.** Register `app` as a standard, secure, fetch-capable scheme and
serve `app://pdf-manager/<path>` only from `dist/`, with URL-decoding,
dot-segment, separator, NUL, drive-letter and symlink checks
(`electron/security.cjs`, `resolveAppAsset`). Every response carries the CSP
and `nosniff`. The `grantFileProtocolExtraPrivileges` fuse is turned off.

**Consequences.** One origin to allow everywhere (CSP, navigation, request
filter, IPC sender checks). PDF.js and OCR workers resolve assets against
`app://pdf-manager/`. The policy is a plain CommonJS module, unit-tested
without Electron, and exercised against real Electron in E2E tests.
