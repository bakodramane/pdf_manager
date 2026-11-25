# 0002 — Keep bundled libraries in `devDependencies`

**Context.** The brief notes that renderer libraries sit in
`devDependencies`. electron-builder copies everything in `dependencies`
(with its tree) into `app.asar`; the renderer, however, only uses what Vite
bundled into `dist/` plus files copied by `scripts/copy-assets.mjs`.

**Decision.** `dependencies` stays empty (enforced by a unit test). The
shipped inventory is taken from the build itself
(`build-meta/bundled-packages.json`) and from the copied assets, and drives
the notices and the shipped SBOM.

**Consequences.** The app archive is 26 MB (no `node_modules`). Security and
licence reviews use the shipped inventory, not the `package.json` sections.
