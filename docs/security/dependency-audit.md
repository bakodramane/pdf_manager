# Dependency audit

Command: `npm audit --json` against the committed `package-lock.json`
(npm 10.9.9, 25 November 2026). Re-run on every CI build (`--audit-level=high`
fails the build) and reviewed weekly through Dependabot.

## Before → after

| | Critical | High | Moderate | Total |
|---|---|---|---|---|
| Baseline (`f0cfc7a`) | 4 | 15 | 16 | 35 |
| Now | 0 | 0 | 6 | 6 |

## Material baseline findings and remediation

| Package (path) | Severity | Shipped? | Fix |
|---|---|---|---|
| `electron` 42.4.1 (direct) — 14 advisories incl. sandbox inheritance for popups, cross-origin reads through file/HTTP handlers, preload code-cache poisoning, permission attribution | high | **yes** (runtime) | Upgraded to 45.5.0 (supported line; 42 is end of life). The app also denies popups, permissions and `file://` access independently. |
| `vite` 5.4.11, `esbuild` (dev server) | high/moderate | no (dev server only) | Vite 8.3.8 |
| `vitest` 2.1.8, `tinypool`, `@vitest/mocker` | critical | no (tests) | Vitest 5.1.1 |
| `concurrently` → `shell-quote` | critical | no (dev script) | concurrently 10.0.7 |
| `tar`, `axios`, `undici`, `js-yaml`, `joi`, `fast-uri`, `follow-redirects`, `@xmldom/xmldom`, `brace-expansion`, `browserslist`, `nanoid`, `postcss`, `source-map-js` | critical/high | no (build/packaging tooling) | Fixed by regenerating the lockfile on current versions |
| `exceljs` → `uuid` < 11.1.1 (buffer bounds in v3/v5/v6 with `buf`) | moderate | bundled, **not reachable** (ExcelJS only calls `v4()` without a buffer) | `overrides`: uuid 11.1.1 |
| ESLint 8 (end of life) | — | no | ESLint 9 flat config |

## Open findings (accepted, time-bounded)

| Finding | Severity | Path | Shipped? | Exploitability | Disposition |
|---|---|---|---|---|---|
| GHSA-g3hv-75wg-m249 — `minimatch` 7.0.0–11.0.0 ReDoS via glob-part amplification | moderate | `electron-builder` → `app-builder-lib` → `@electron/universal` / `minimatch@9`/`10` | **No** (build time only) | Patterns come from our own `electron-builder.yml`; no untrusted input reaches minimatch | Accepted until electron-builder ships a fixed dependency. `npm audit fix --force` would downgrade electron-builder to 24.13.3 (older, unsupported) — rejected. Review on each Dependabot update; **re-assess by 31 March 2027**. |

The six reported entries are this one advisory propagated through
`@electron/universal`, `app-builder-lib`, `dmg-builder`, `electron-builder`
and `electron-builder-squirrel-windows`.

## Beyond npm audit

- **Electron/Chromium**: track
  https://www.electronjs.org/docs/latest/tutorial/electron-timelines and the
  Electron security advisories; upgrade within the supported majors at least
  monthly (Dependabot groups `electron` and `electron-builder`).
- **PDF.js**: only the latest release receives security fixes; 6.5.438 is
  current. PDF.js evaluates no document JavaScript in this app (no scripting
  sandbox loaded), XFA is disabled, and `isEvalSupported` no longer exists in
  PDF.js 5+ (no `eval` path).
- **OCR assets** (Tesseract.js 7.0.0, core 7.0.0, tessdata best_int) are
  pinned by version and SHA-256 digest (`scripts/asset-digests.json`).
- **Static analysis**: CodeQL (`security-extended`) runs on PRs and weekly.
  OSV-Scanner was not run in this environment (not installed); recommended as
  an additional CI step if the maintainer wants a second advisory source.
