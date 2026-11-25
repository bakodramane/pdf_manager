# 0009 — Web edition offline model

**Decision.** A hand-written service worker generated at build time
(`scripts/sw-template.js` + Vite plugin) with the exact precache list and a
content-hash version. Precached: the app shell, PDF.js worker, standard
fonts, WASM decoders and ICC profiles. Cached on first use: CMaps and fonts.
OCR engine and language packs: only after the user presses "Make available
offline" (sizes shown); the page confirms the files are readable before
saying so. New versions wait until the user chooses to reload. Not
registered in Electron or in development.

**Rejected.** Workbox (extra dependency for a small worker), automatic model
downloads (bandwidth cost for users on expensive connections).

**Consequences.** Works at any sub-path (`/pdf_manager/`) because all paths
are relative to the registration scope. GitHub Pages cannot send CSP
headers, so the CSP is a `<meta>` tag (`frame-ancestors` not enforced).
