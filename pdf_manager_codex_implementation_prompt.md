# Codex implementation brief — PDF Manager: secure, accessible, distribution-ready release

**Repository:** https://github.com/bakodramane/pdf_manager  
**Baseline:** `main`, version 0.1.0 as observed during the repository review; re-check the actual checkout before changing anything.  
**Target:** a stable, security-reviewed, bilingual, local-first public release, with Windows portable and per-user NSIS builds, an optional Microsoft Store package, and a lightweight web/PWA edition.  
**Licence:** Apache-2.0. Preserve author attribution and existing licence terms.  
**Audience:** students, teachers, researchers, professionals, public administrations, NGOs and small businesses, especially in low-bandwidth and resource-constrained environments.

---

## 1. Role and mission

Act as a senior software engineer, Electron/TypeScript security engineer, PDF-processing specialist, accessibility specialist and release engineer. Work directly in the existing repository. Implement the improvements below, not just a proposal or a collection of pseudocode. Produce maintainable, tested, documented changes and an evidence-based release-readiness assessment.

The product must remain **free to use, open source, bilingual (English/French), local-first, usable without an account, and usable without administrator privileges on supported Windows configurations**. Do not introduce advertising, tracking, cloud PDF processing, subscriptions, mandatory online activation or an external backend. Preserve the existing application rather than replacing it wholesale.

Prioritise security, document integrity, accessibility, performance on modest hardware and reliability over feature count. Preserve the existing product name, author identity and Windows application ID unless the maintainer expressly approves a migration. Do not imply employer endorsement or add institutional logos.

### Execution priorities

| Priority | Workstream | Release policy |
|---|---|---|
| P0 — mandatory | Dependency audit, runtime upgrade if necessary, Electron/web hardening, integrity, privacy, regression tests, packaging, secure release workflow | No public stable release until applicable gates pass |
| P1 — high | Offline English/French OCR and searchable-PDF export, real compression, Unicode text, safer save/export, accessible UX, core document features, PWA | Implement, test and document; do not publish a broken or incomplete feature as stable |
| P2 — valuable | PDF password protection where safe, genuine redaction where safe, cryptographic PDF signatures, broader platform support, advanced accessibility and formats | Implement only if robust and independently verifiable; otherwise explicitly defer or isolate as experimental |
| External prerequisite | Authenticode production certificate/service, Microsoft Partner Center identity and Store publication, external directory acceptance | Prepare integration and instructions; never purchase, register, publish or claim approval without authorisation |

Complete P0 before adding substantial new dependencies. Proceed through P1 and then P2 as far as sound implementation and tests permit. If a requirement is infeasible, record the reason, evidence, alternatives and the remaining work; do not silently omit it. Never hide a failure behind a placeholder, disabled test, fake implementation or optimistic status label.

## 2. Existing architecture and baseline discovery

The reviewed project uses Vite, React, TypeScript, PDF.js (`pdfjs-dist`), `pdf-lib`, Electron, `electron-builder`, `docx`, `exceljs` and Vitest. Existing capabilities include page manipulation, merge/split/extract, annotation, signature images, form filling, Word/Excel export, basic structural compression, undo/redo and English/French translations.

Observed configuration (verify before relying on these values):

- `package.json`: version `0.1.0`, Electron `42.4.1`, Vite `5.4.11`, PDF.js `4.10.38`, `pdf-lib` `1.17.1`; libraries currently sit in `devDependencies` even when bundled into the renderer.
- `electron-builder.yml`: `com.local.pdfmanager`, Windows x64 portable and NSIS targets, per-user installation, `asInvoker`, no auto-updater, ASAR enabled, unpacked PDF.js resources, EN/FR locales.
- `electron/main.cjs`, `electron/preload.cjs`, `electron/menu.cjs`: context isolation, sandbox, no Node integration, local-file app loading, a language IPC bridge, menu-command forwarding and external-link handling.
- `vite.config.ts`: relative base `./`, worker modules, static renderer output suitable for Electron and static hosting.
- `src/pdf/`: pure page operations, parsing/rendering, assembly, annotations, forms, compression, extraction, layout and conversion.
- `src/hooks/`, `src/components/`, `src/i18n/`: editor state/history, UI, shortcuts and translations.
- Current README reports an approximately 82 MB executable, a 200 MB source-file ceiling, no OCR, limited compression, standard-font limitations, unsigned binaries and non-lossless PDF-to-Office conversion. Treat these as documented baseline claims, not verified performance or security guarantees.
- A prior local npm installation reported 35 vulnerabilities (including four critical); this is historical evidence, not a current audit. Re-run the audit against the actual lockfile. Do not assume all findings reach the packaged app.

Before implementation:

1. Inspect `AGENTS.md` and other repository instructions, `git status`, branch, commit, file tree, workflows, lockfile, licence, Electron configuration, source, tests and open issues relevant to the task. Respect uncommitted user changes; never reset or overwrite them.
2. Create a dedicated feature branch (suggested `feat/distribution-readiness`) from the appropriate clean base if authorised by the environment. Use coherent, reviewable commits; do not merge or push to `main` without explicit permission.
3. Run baseline installation, type checks, lint, tests and production build using supported Node/npm versions. Record exact commands, versions, exit codes, failures and existing test coverage. Check the current supported Node and Electron release lines from upstream sources; do not blindly reuse an old LTS version or upgrade every dependency indiscriminately.
4. Record an inventory of existing features, packaging artifacts, runtime network behaviour, security boundaries, known limitations and regression fixtures in `docs/distribution-readiness.md` (or equivalent existing location). Update it throughout implementation.
5. Identify dependencies in the actual web bundles, workers, ASAR and native runtime. Use this inventory for security and licensing decisions rather than interpreting `dependencies` versus `devDependencies` as a reliable runtime distinction.

## 3. P0 — Security and dependency remediation

### 3.1 Supply-chain security

- Run `npm ci` with a supported and documented toolchain, `npm audit --json`, inspect lockfile/dependency trees, upstream advisories and reachable code. Run suitable source and dependency scans (e.g. CodeQL/OSV/Dependabot where supported). Check Electron/Chromium and PDF parser advisories, which may not all appear in npm audit.
- For each material finding record advisory/CVE, severity, affected range, dependency path, whether it is shipped or executed in CI, exploitability, fix and verification. Fix all applicable critical/high risks before public stable release. For unfixed findings, document an evidence-based, time-bounded exception with mitigation and maintainer review; never waive exploitable critical/high runtime findings.
- Upgrade Electron to a patched, currently supported stable version as needed, and update Vite, PDF.js, conversion libraries and other dependencies incrementally. Confirm Node compatibility, API compatibility, worker resources and Windows support. Do not use `npm audit fix --force` as a blanket remediation; do not apply overrides without checking compatibility and upstream fixes.
- Pin direct dependency versions and commit a consistent lockfile. Use `npm ci` in CI. If npm install scripts are restricted by the current toolchain, narrowly allow only verified required scripts (e.g. Electron/esbuild/packaging scripts when applicable), document the decision and test clean installs. Never globally enable untrusted lifecycle scripts.
- Generate an SPDX or CycloneDX SBOM covering renderer, worker and desktop dependencies, including Electron and separately shipped assets. Include third-party licence notices and model/font licences. Verify redistribution rights for all dependencies and assets. Preserve the Apache-2.0 licence in distributed artifacts.
- Configure automated security/dependency updates, dependency review for PRs, security scanning and secret scanning where available. Review third-party GitHub Actions and pin them to immutable commit SHAs, with readable version comments. Restrict permissions and token scope.

### 3.2 Electron security boundary

Preserve and verify `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, no insecure content and no generic Node/OS bridge. Consult Electron's current security checklist.

- Inspect the existing `file://` navigation allowance and broad `http(s)` `shell.openExternal` forwarding in `electron/main.cjs`. Prefer a properly registered secure local application protocol serving only packaged assets, with path normalisation and traversal/symlink checks. If retaining `file://`, explicitly constrain navigation to the intended entry point and asset access to the app; explain residual risks and test them. Do not grant broad filesystem access to renderer content. Register a custom protocol only with required privileges and verify PDF.js workers, OCR WASM and local assets still work.
- Validate parsed URL scheme, exact origin/path and sender frame for navigation, redirects, IPC and external links. Development server exception must use an exact parsed origin rather than `startsWith`; dev server, DevTools and debugging hooks must not ship enabled in production. Deny unsolicited windows, cross-origin frames, unexpected permission requests (including geolocation, media, notifications, clipboard reads, USB), downloads from remote origins, and unsupported schemes. Permit only necessary user-initiated, explicitly allowlisted external HTTPS destinations (author, official docs, release page) via the system browser; never execute URL-provided commands.
- Apply an enforceable production Content Security Policy for both web and desktop builds. Start from restrictive `default-src 'none'`/self-based policies, limit script, worker, image, font, style, frame and connection sources to actual needs. Account for local WASM (`wasm-unsafe-eval` only if demonstrably required), blob workers/object URLs, PDF rendering and packaged OCR assets without enabling generic `unsafe-eval` or unnecessary remote sources. Document any unavoidable exceptions. Avoid inline executable scripts; never disable web security to fix a worker problem.
- Restrict IPC channels to narrow typed operations. Validate sender identity and main frame, schemas, payload lengths, expected values and user interaction where needed. Review `app:set-language` and fixed menu-command forwarding; avoid arbitrary JavaScript, filesystem paths, commands, URLs or IPC event exposure in preload. If implementing native save dialogs, require validated document bytes and explicit user-selected destinations; prevent arbitrary reads/writes by the renderer.
- Deny production renderer HTTP(S), WebSocket and other unsolicited external network requests using defence in depth (CSP and carefully scoped Electron session request policies). Review certificate-error handling: reject invalid certificates, never install a global bypass; a certificate handler alone does not prevent network access. Disable remote update/telemetry/crash upload unless separately approved and explicitly opt-in. Keep development behaviour isolated. Test renderer and worker network restrictions, and measure packaged process outbound traffic in an isolated test environment where possible. Be precise about what is verified; opening an explicit external link in the user's browser is distinct from in-app processing.
- Review Electron fuses supported by the selected version/packager: disable RunAsNode, Node option environment variables and CLI inspector where compatible; enable embedded ASAR integrity/only-load-from-ASAR where supported and tested. Apply before signing. Treat ASAR as packaging, not encryption or a standalone security boundary.
- Threat-model malicious PDFs, malformed images, annotations, filenames, embedded links, JavaScript/actions, attachments, form scripts, hostile HTML/text and archive/resource bombs. Never execute embedded PDF JavaScript, launch actions or external resources. Configure PDF.js safely (e.g. disable scripting/eval where supported and compatible). Render untrusted strings as text; no unsafe HTML injection. Clearly distinguish safe viewer behaviour from sanitisation of exported documents: copied PDFs can retain risky objects unless explicitly stripped and verified.
- Create regression/security tests for hostile URLs (including deceptive localhost prefixes), path traversal, malformed IPC, unexpected windows, denied permissions, untrusted PDF links/actions and outbound connection attempts. Avoid using live malware; use synthetic fixtures.

### 3.3 Document safety, privacy and resource management

- Keep document content, OCR output, signature images and conversion results in memory or user-authorised storage only. No persistent document cache, hidden cloud backup, analytics, crash uploads, recent-file history or autosave of sensitive content by default. Preferences such as language/theme can persist separately. Do not claim secure memory erasure or guaranteed absence of OS swap/temp files.
- Audit object URLs, workers, canvas buffers, WASM allocations, temporary files and undo history. Revoke/terminate/free resources on close, cancellation, error and replacement; ensure original input is never deleted or overwritten silently. Document portable-profile and temporary extraction behaviour, including shared computers and USB drives.
- Replace a single byte limit with tested limits for file size, total loaded size, page count, decoded image pixels, render/OCR DPI, undo memory and concurrent tasks. Use adaptive limits and actionable bilingual errors. Guard corrupt PDFs, decompression bombs, large image dimensions and expensive render/OCR tasks with cancellation, bounded queues and timeouts. Avoid reading an entire folder of documents at once.
- Handle password-protected documents honestly; do not bypass encryption. Prompt for a password only where supported, retain it no longer than necessary, never log it, and make unsupported editing/export explicit. Detect existing digital signatures and warn that editing/rebuilding can invalidate them. Do not quietly claim preservation of signatures, bookmarks, tags, links, metadata or forms when not verified.
- Add safe export names, overwrite confirmation, preservation of original files, cancellation and verification of outputs. For native saves, use a temporary sibling file and atomic replacement where feasible; report failures without losing the working document. For web downloads use browser capabilities and communicate limitations.
- Review document metadata exposure, accidental leakage via logs/diagnostics, and accessibility of error messages. Use sanitised diagnostics with no document content, personal filenames or secrets; any diagnostic export must be user-initiated.

## 4. P0 — Windows code signing and trusted release engineering

**Important distinction:** Authenticode signs the application executable to establish publisher identity/integrity. A cryptographic PDF signature signs a document. A visible signature image is neither. Do not conflate these three capabilities in UI, documentation or release claims.

### 4.1 Authenticode for portable and NSIS builds

- Keep both existing targets working: Windows x64 per-user NSIS installer and portable executable. Preserve English/French installer selection, app shortcuts, uninstall behaviour and no elevation requests. Preserve the existing app ID to avoid accidental duplicate installs.
- Implement a supported `electron-builder` signing configuration or trusted external signing integration for a real Authenticode certificate or managed signing service. Inspect current upstream options and provider eligibility before choosing a mechanism. Prefer a provider-neutral approach and secure key custody (hardware token/HSM/managed signing or approved CI mechanism). Use SHA-256 and a trusted RFC 3161 timestamp service when supported.
- Sign the packaged app executable and all required publisher-owned PE binaries/helpers, and the final NSIS and portable wrappers in the correct build order. Apply build modifications/fuses before signing. Validate final artifacts and installed/extracted executables, not just an intermediate file. Respect vendor-signed third-party binaries; do not replace third-party signatures indiscriminately.
- Add separate unsigned development and trusted production signing workflows/scripts. Production-signed jobs must fail closed if credentials are missing, signature validation fails or required artifacts are unsigned. Unsigned builds are useful for local testing or an explicitly labelled prerelease; do not silently publish them as signed or recommend bypassing SmartScreen or institutional controls.
- Never commit PFX files, private keys, signing passwords, tokens, test production secrets or certificate material containing private keys. Use protected environments, restricted release triggers, least-privilege credentials/OIDC where supported, approval gates and no signing secrets in fork PRs. Do not create a self-signed certificate and present it as publicly trusted. Document any test-only signing separately.
- Verify with Windows SDK `signtool verify /pa /all /v` and/or PowerShell `Get-AuthenticodeSignature`; inspect publisher, certificate chain, trust and timestamp. Fail release verification on invalid signatures; test on a clean Windows host. Note that signing does not guarantee the absence of SmartScreen reputation warnings, and that SHA-256 hashes do not replace a trusted signature.
- Research realistic no-cost or sponsored signing options available to this open-source project and its maintainer, but treat approval, geography, identity and availability as external prerequisites. Do not spend money, enrol accounts, request private credentials in chat or claim a certificate was obtained. Record concrete steps the maintainer must perform. Preserve a clear unsigned-build path while waiting for external signing approval.

### 4.2 Microsoft Store packaging (separate distribution channel)

- Prepare an MSIX-compatible Store submission build if supported by the selected tooling. Inspect current Microsoft Partner Center requirements and Electron packaging options (`appx`/MSIX or official packaging tooling as appropriate); do not invent an unsupported electron-builder target. Maintain distinct Store identity/publisher values assigned by Partner Center and avoid guessing final identifiers.
- Ensure required manifest metadata, architecture, icons/assets, bilingual listing copy, privacy policy link, support URL, versioning, licence, capabilities and install/update/uninstall tests. Test local package installation using an appropriate development/test certificate; never distribute a test certificate as a production trust solution.
- Document the distinction between Store-managed signing and independent Authenticode signing: Store acceptance/signing does not sign existing GitHub NSIS/portable downloads. Verify current fees, individual account eligibility, Store policy, distribution regions and required identity verification through official Microsoft sources. No paid commitments or submissions without approval.
- Preserve offline operation and no-account use after installation. Document any Store-specific installation prerequisites. Do not request Store capabilities that are not necessary.

### 4.3 Automated build, provenance and release gates

Implement or improve GitHub Actions workflows for PR CI and tagged/manual release preparation. Use existing workflow conventions where possible.

- On PR: clean install, lint, typecheck, unit tests, relevant integration/security tests, production build, dependency review and secret/security scanning. Do not run PR code with release secrets or use unsafe `pull_request_target` checkout patterns. Pin actions and specify minimal permissions.
- On release: build on appropriate runners (Windows for Windows installers), run tests and smoke checks, verify version consistency, create portable and NSIS artifacts, optional Store artifact and web build, produce SBOM/third-party notices, sign in an authorised environment when configured, verify signatures, then generate checksums over the final bytes. Use tag/version checks, guarded release inputs and a protected approval environment.
- Use SHA-256 checksums with unambiguous artifact names; publish `SHA256SUMS.txt`, release notes, SBOM, notices and where supported build provenance/attestations. Verify the digest and provenance in a separate verification step. Clearly label unsigned artifacts. Consider GitHub artifact attestations for public repositories if available; attestations are not a substitute for Authenticode.
- Package only required production assets. Never publish source maps containing sensitive material, dev dependencies not needed at runtime, test keys, `.env` files, fixtures with sensitive data or temporary build files. Check asset size and bundle contents. Use cache safely; avoid untrusted build artifacts in signing jobs.
- Prepare draft release creation and documented manual publish procedure; do not publish a stable public release, push tags or submit to stores without explicit authorisation. If an unsigned public preview is later authorised, label it prominently as such. No silent auto-updater or unsolicited network check; use a user-initiated official download link and documented manual update process, with Store-managed updates applicable only to the Store edition.
- Provide an explicit maintenance policy for supported versions, dependency updates, security incidents and release cadence. Add `SECURITY.md`, `CHANGELOG.md`, release checklist and `SUPPORT.md` (or integrate with existing files). Avoid promising response times that the maintainer has not agreed to.

## 5. P1 — Offline optical character recognition (OCR)

Implement production-quality OCR for scanned PDFs and images, with English and French as first-class languages. It must operate on-device with no mandatory network, cloud API or account. Prefer a maintained WASM-based engine such as Tesseract.js after checking current upstream versions, language data, worker/WASM compatibility and licence. Evaluate alternatives if they offer materially better local performance, maintainability or accuracy. Do not use remote CDNs or silently download model weights during OCR.

### 5.1 OCR engine and workflow

- Add a dedicated, typed OCR module (e.g. `src/pdf/ocr/`) separate from React. Run CPU-intensive work in workers, not on the UI thread. Use a bounded worker pool (default one on low-memory machines), lazy loading, progress callbacks, cancellation, timeouts, clean termination and memory cleanup. Render only needed pages at configurable resolution; respect page rotation, crop boxes and coordinate systems.
- Detect pages lacking a useful text layer; let the user choose current page, selected pages, a page range, or entire document. Handle mixed scanned/digital PDFs without duplicating existing selectable text by default. Offer explicit re-OCR where needed with clear warning and safe behaviour.
- Provide language options English, French and combined English+French; use quality/speed presets and explain limitations. Consider preprocessing (orientation, deskew, contrast, adaptive thresholding, noise removal) with a preview or conservative defaults; preserve original page images and do not destructively change them unless requested.
- Provide progress such as page count, status and cancellation; errors must identify affected pages without exposing document content in logs. Allow partial results only when explicitly labelled; user must be able to retry failed pages. Prevent accidental simultaneous costly operations and stale results after document changes.
- Bundle pinned, licensed OCR worker/core/WASM assets and English/French traineddata in desktop builds, including the portable edition, so fresh offline installations can OCR immediately. Resolve assets relative to the local app origin and ASAR packaging. For the web/PWA edition, load same-origin versioned language assets on explicit user selection/preparation; display size and caching state, support offline use after the necessary assets are cached, and fail gracefully offline if a language pack is unavailable. No hidden downloads, third-party CDN fallback or document transmission.
- Verify language files by digest at build time, document origin/version/licence, include notices and avoid dynamically executing fetched code. Provide optional additional languages only via verified, user-controlled packs in a later release if needed.

### 5.2 OCR outputs

Implement the following outputs with clear distinction between recognition and conversion:

1. **Recognise and copy/export text:** display editable recognised text per page; offer UTF-8 `.txt` export for selected pages and copy-to-clipboard on explicit user action.
2. **Searchable PDF:** preserve the original visual page and add an invisible, correctly positioned Unicode text layer. Map OCR bounding boxes to PDF coordinates taking into account raster DPI, rotation, crop/media boxes and text direction. Use standards-compatible invisible text rendering and embedded fonts, not visible white text or a flattened screenshot as a substitute. Test selection, copy, search and layout in independent PDF viewers. Ensure existing digital text is not duplicated. Export as a new file, preserving original page appearance and order; document what existing PDF structures may be affected.
3. **OCR-assisted PDF-to-Word:** optionally feed OCR text/geometry into the existing layout reconstruction pipeline for scanned pages. Label it approximate; preserve images where appropriate and do not promise exact reconstruction. If implementation cannot reliably reconstruct layout, export recognised paragraphs instead and explain the limitation.
4. **OCR-assisted PDF-to-Excel:** optional table reconstruction from recognised text/bounding boxes using existing layout logic. Provide a confidence/quality warning and editable output; do not invent data or silently interpret ambiguous numbers. Preserve numeric formats where confidently parsed; default uncertain values to text. Never turn untrusted PDF content into executable spreadsheet formulas. Treat formula-like strings as literal text in spreadsheet and any CSV exports.

Expose OCR confidence as an approximate recognition signal, not calibrated accuracy. Mark low-confidence pages or words when supported; never present OCR-derived legal, financial, scientific or official records as validated data.

### 5.3 OCR acceptance criteria

- OCR works on a clean Windows installation with all external network access disabled, including both EN/FR models and combined language mode. The app makes no external request during OCR. The PWA works offline once the relevant language assets are explicitly prepared.
- Synthetic or appropriately licensed fixtures cover English, French accents (`é`, `è`, `à`, `ç`, `œ`), mixed text, multi-page scans, rotated pages, poor contrast, mixed scanned/digital documents, cancellation and corrupt inputs. Include expected text transcripts, page geometry checks and independent searchable-PDF validation.
- Report character error rate (CER) and word error rate (WER) on a small reproducible fixture corpus by language and image quality; use clean-scan targets (proposed CER ≤5%, WER ≤10% at suitable DPI) as initial engineering goals, not universal guarantees. Record failures and refine fixture-specific acceptance criteria transparently. Do not hide low-quality or skewed results behind average scores.
- Verify original visual appearance through render comparisons, selectable/searchable text, accurate placement, no duplicate text, no accidental new visible marks, and valid PDFs in at least one independent viewer/parser beyond the application itself.
- Capture elapsed time per page, peak memory, worker concurrency and cancellation latency on representative hardware or CI. Report actual environment and avoid extrapolating to untested low-end devices.

## 6. P1 — Real PDF compression and optimisation

Current structural compression cannot materially shrink many image-heavy documents. Extend it conservatively.

- Keep the existing lossless structural optimisation as a separate option. Add image optimisation/downsampling with named quality profiles (e.g. lossless, balanced, strong, custom). Provide estimates where reliable, explicit lossy warnings, original/output sizes and measured percentage reduction. Use sensible DPI/quality defaults and allow cancellation. Preserve originals and avoid making output larger unless user explicitly accepts it.
- Prefer safe rewriting of embedded image resources when supported; preserve page text, vector content, annotations, transparency, forms and other document structures. Deduplicate images and handle masks, colour spaces, alpha, rotations and repeated resources correctly. Skip unsupported resources rather than corrupting them. Choose suitable image encoders with permissive redistribution rights and local execution.
- If a rasterise-and-rebuild fallback is implemented, expose it as a distinct, explicitly lossy **flatten to images** mode; warn that selectable text, accessibility structure, forms, vector fidelity, links and signatures can be lost. Never silently rasterise a normal PDF. If combined with OCR, clearly indicate that the new text layer is reconstructed.
- Provide tests for office PDFs, photos, scanned text, transparency, vector-heavy pages, forms and rotated pages. Check output validity, page count/order, visual quality, selectable text, form preservation where claimed, and compression ratio on a fixed corpus. Set an initial measurable target for image-heavy fixtures (e.g. ≥30% reduction for an intentionally oversized scan at balanced settings) without promising that every input can shrink.

## 7. P1 — Unicode, editing and document productivity

Implement these incrementally with backward compatibility and EN/FR UI parity.

- **Unicode annotations:** replace or supplement standard-font-only annotations with embedded, subsettable open-licensed fonts (e.g. appropriately licensed Noto fonts and a supported font embedding library). Handle French ligatures/accents and common Latin extended characters correctly; detect unsupported scripts/glyphs rather than silently replacing them with `?`. Support broader scripts only after shaping, bidi, fallback and rendering tests. Keep font assets compact and notices included. Verify exported text visually and by extraction.
- **Annotation tools:** add freehand ink, highlight, underline/strikeout where supported, lines, arrows and rectangles; opacity, colour and thickness controls; optional free rotation. Distinguish text highlights from drawn overlays. Preserve selection, dragging, undo/redo, rotation and export semantics. Support keyboard access, consistent controls, touch where feasible and meaningful accessible labels.
- **Page tools:** add blank page creation, page duplication, custom split ranges, page numbering, watermark (text/image, opacity, rotation, selected pages), and crop/resize where safe. A visual crop does not delete hidden content: make that explicit. Consider bookmarks/outline preservation and creation, and safe metadata viewing/editing/removal. Test mixed page sizes/orientations and preservation of forms/links where claimed.
- **Image to PDF:** import JPG/PNG and other safely supported local formats; validate magic bytes, dimensions and size, support multiple images, ordering, page size, margins and orientation. Handle transparency, EXIF orientation, and strip unnecessary sensitive image metadata where appropriate. No remote image fetch.
- **PDF to image:** export selected pages as PNG/JPEG with explicit resolution and quality; zip multi-page outputs only with safe filenames and resource limits. Keep the process local.
- **Search and navigation:** add document text search with next/previous matches, page jump, case option and OCR layer support. Avoid blocking UI on large files, and clear search state when closing a document.
- **Forms and signatures:** preserve supported AcroForm values and field appearances; consider explicit flatten-forms export. Maintain signature-image insertion/background removal, add drawing a signature locally if practical, and label all of these as visual signatures rather than cryptographic signing. Never store signatures for reuse without opt-in. Do not execute PDF form scripts.
- **Office conversion:** improve reading order, paragraph grouping, headings, tables, numeric parsing, multilingual text, image placement and conversion warnings. Preserve existing Word/Excel exports. Prefer truthful best-effort conversion to artificial exactness. Test independent DOCX/XLSX parsing, formulas-as-literal text and corrupt/ambiguous inputs. Do not claim full editing of existing PDF text: if an actual content-stream text editor cannot be implemented reliably with current libraries, keep adding/editing annotation text as a separate feature and document the distinction.
- **Batch processing:** if feasible after core features, offer sequential local merge/compress/OCR/convert jobs with explicit file selection, output naming, queue progress, cancellation and bounded memory. Prevent partial output from being mislabelled complete.

For each feature, ensure state model/history integration, undo/redo where appropriate, localisation, unit tests and export regression coverage. For destructive operations show meaningful confirmation or provide reliable undo. Use modular feature flags only if genuinely helpful; do not expose incomplete functionality as working.

## 8. P2 — Advanced PDF security features (conditional implementation)

These features are security-sensitive. Do not create misleading substitutes. Evaluate mature libraries/engines and document licence, bundle size, platform compatibility and maintenance. A clear deferral is preferable to a false security guarantee.

### 8.1 Password protection and encrypted documents

- Evaluate reliable local PDF encryption/decryption support using maintained libraries with verified redistribution rights. If implementing, support interoperable modern encryption (prefer AES-256 with a standard-compatible revision), explicit password entry and safe handling, and independent viewer verification. Never equate PDF permission flags with strong access control; explain limitations. Do not attempt password cracking, bypass encryption or silently downgrade encryption.
- If robust encryption is not available in the selected stack, preserve truthful detection/password handling and record a separate implementation proposal. Never claim that `pdf-lib` ignoring encryption or a ZIP password constitutes PDF encryption.

### 8.2 Genuine redaction

- Implement only if sensitive content can be irreversibly removed from relevant PDF content streams, image pixels, OCR layers, annotations, metadata, hidden objects, incremental history and associated resources as applicable. Account for overlapping objects, repeated resources, rotated pages, transparency and accessibility structures. A black rectangle, white rectangle, crop or hidden text is **not redaction**.
- Preview proposed regions, require explicit confirmation, export a new file and verify removed content with independent extraction, object inspection and rendering, including attempts to select/copy/search the redacted text. Do not claim sanitisation beyond tested scope. If safe redaction is unavailable, do not ship an overlay labelled redaction; document an explicit deferral. A separate flattened-image redaction workflow may be considered only if all sensitive pixels and hidden layers are removed and the destructive/accessibility trade-off is clearly documented and independently tested.

### 8.3 Cryptographic PDF digital signatures

- Research a maintained, offline-compatible PDF signing/verification implementation supporting CMS/PKCS#7 detached signatures and appropriate PDF signature dictionaries, `ByteRange` and incremental updates. Evaluate PAdES baseline compatibility; do not claim PAdES conformance, qualified electronic signature status or legal equivalence without appropriate validation and evidence.
- If feasible, implement a distinct advanced **Digitally sign PDF** workflow for user-owned signing certificates/keys (e.g. PKCS#12/PFX), explicit password entry, certificate details and visible or invisible signature choice. Never generate or collect production private keys without user authorisation; never upload keys/documents, persist passphrases or log secrets. Use platform-secure signing facilities when appropriate and keep private-key handling out of generic renderer APIs.
- Verify document integrity, signature coverage, signer information, trust chain status and relevant modification status independently. Distinguish cryptographically valid, trusted, untrusted, expired, revoked (only if checked), altered and indeterminate. With offline validation, disclose that revocation/timestamp trust cannot necessarily be established. Any optional online timestamp or revocation check requires explicit user consent, a clear explanation of what is sent and a separate design decision; do not silently violate local-first privacy.
- Preserve existing signatures only when the chosen operation and incremental-update rules permit it; warn before modifications that invalidate them. Do not claim that visible image signatures are cryptographically valid. Use synthetic test certificates only in test fixtures and never as trusted production identities. Verify with independent PDF/signature tooling.
- If safe implementation is not feasible within this work, deliver an architectural decision record and keep the existing visual signature feature accurately named. Do not fake a signature or a verification badge.

## 9. P1 — Accessible UX and low-resource operation

- Preserve English/French across app, errors, tooltips, menus, installer, release notes and end-user guides. Use translation key parity tests; no hard-coded untranslated user-facing strings. Set document `lang` dynamically. Localise dates/numbers and recognise French/English numeric conventions without corrupting data.
- Target WCAG 2.2 AA for applicable web/app UI, without claiming formal certification. Provide semantic controls, keyboard-only navigation, visible focus, screen-reader labels, labelled forms/dialogs, focus trapping/restoration, accessible live progress/error announcements, contrast, reduced motion and zoom support. Provide alternatives to drag-only page reordering and image placement. Test keyboard and screen-reader workflows, not just automated axe results.
- Improve onboarding: start screen with open/drag-drop, clear tool groups, context-sensitive actions, helpful empty/error states, keyboard shortcuts, undo/redo visibility, save/export feedback and concise bilingual tutorials. Maintain consistent dark/light theme and adequate touch targets. Do not redesign the entire UI gratuitously.
- Support small screens and lower resolutions; ensure core desktop workflows are usable at 1366×768 and test smaller layouts. Browser/mobile layouts should degrade gracefully, with mobile limitations stated rather than claiming untested compatibility.
- Optimise render virtualisation/lazy thumbnails, worker use, resource caches, memory-bound undo history and cancellation. Measure startup, bundle size, executable size, memory use and long-document performance against baseline. Target usable basic workflows on 4 GB RAM Windows machines and validate where hardware is available; use conservative concurrency defaults. Record test hardware and do not claim results on untested machines.
- Keep desktop OCR models local, but lazy-load OCR engine, conversion and advanced tools. For web, keep initial app shell lightweight; report initial transfer separately from optional OCR packs. Avoid CDN dependencies, auto-fetching heavy assets or loading models not requested. Provide clear sizes to users with expensive internet connections.

## 10. P1 — Web edition and Progressive Web App

Maintain one shared TypeScript/React PDF core, with thin desktop/browser adapters. Deployable static web build must not require a backend or upload documents.

- Add a separate production web/PWA build or environment-specific configuration, preserving Electron's relative asset paths and avoiding service-worker registration in Electron/file/custom-protocol contexts unless explicitly justified. Ensure GitHub Pages subpath `/pdf_manager/` works for assets, workers, fonts, OCR models, manifest, routing and service worker scope. Test production build at that path rather than just localhost root.
- Implement web manifest, suitable icons, installability, versioned offline app-shell caching and a user-controlled update flow. Cache only public application assets and explicitly prepared OCR language packs. Never cache document bytes, signature images, user PDFs or generated outputs in Cache Storage/IndexedDB. No remote telemetry or external CDN calls. Clearly distinguish initial page/model downloads from local processing.
- Provide an offline readiness indicator and explicit language-pack preparation with download size and offline availability. Test first visit online, subsequent fully offline session, missing optional model offline, cache updates and invalidation. Avoid mixing old/new app and worker versions; allow user to defer reload while editing. Supply a safe reset mechanism that affects only app-owned caches/preferences and does not delete user files.
- Add GitHub Pages deployment workflow (or prepare it if repo settings require maintainer action), use least privilege and protected deployment environment. Configure restrictive CSP using hosting-supported mechanisms; verify actual deployed response headers/meta policy and note limitations of static hosting (e.g. headers not configurable in some environments). Do not claim headers such as `frame-ancestors` are enforced by a meta CSP. If stronger isolation requires a different host, document trade-offs and free alternatives without moving the site without approval.
- Test current supported Chromium/Edge/Firefox and Safari where tooling permits, recording actual browser versions and limitations. Do not assume PWA installability or file-system APIs are identical across platforms. Browser download and native file-save fallbacks must work.

## 11. P0/P1 — Testing strategy and release acceptance

Extend existing Vitest tests and add browser and Electron integration/end-to-end tests (e.g. Playwright, after verifying compatibility). Use deterministic synthetic or openly licensed sample files; never commit real confidential documents, passwords or personal signature images. Record test fixture provenance/licences.

| Area | Minimum evidence |
|---|---|
| Existing PDF tools | Merge/split/extract/insert/delete/rotate/reorder, undo/redo, annotation, forms, export, existing Word/Excel conversion all pass |
| Document integrity | Independent parser/viewer opens generated PDFs; page counts, geometry, visual output, text/forms/links where promised; original input unchanged |
| Security | Dependency triage, threat model, hostile URL/IPC and resource-limit tests, production CSP, network-denial tests, no exposed secrets |
| OCR | EN/FR fixtures, mixed/rotated scans, CER/WER, searchable layer validation, offline operation, cancellation |
| Compression | Lossless and lossy profiles, measured sizes, fidelity and no unannounced content loss |
| Unicode and conversion | Accents/ligatures, text extraction, layout and literal spreadsheet strings |
| Accessibility | Automated checks plus manual keyboard/focus and screen-reader smoke tests; document unresolved issues |
| PWA | Subpath deployment, install where supported, offline app shell and prepared OCR packs, update safety, no document caching |
| Windows packaging | Clean Win10/Win11 x64 environments where supported by runtime; portable launch, user-scope install/uninstall, bilingual setup, no admin elevation, offline use, paths with spaces/accents, USB/temp behaviour |
| Signing/provenance | Final artifacts verified, hashes match, provenance/SBOM present; explicitly record blocked signing if no trusted identity/credentials |
| Performance | Baseline versus new startup, bundle size, memory, OCR time, large-document and cancellation tests, hardware/environment details |

Test Windows 10 only where current Electron/Chromium support and applicable OS security support make it appropriate; distinguish application compatibility from OS support status. Do not imply an unsupported OS is secure. Test ARM64 only if providing an ARM64 build; x86/32-bit and Linux/macOS desktop packaging are separate optional targets, not promises. Browser support does not mean native desktop support.

Add a representative fixture matrix: single/multi-page digital PDF; encrypted and malformed PDF; mixed scans; 90/180/270-degree rotation; cropped and varied page sizes; forms; links/bookmarks; existing signatures; embedded images/transparency; large files; Unicode; hostile but harmless synthetic content. Verify exported files with independent parsers, and rendered pixel/perceptual comparisons with documented tolerances. Tests must assert actual outcomes, not only successful return codes.

### Mandatory release gates

- All relevant lint/typecheck/unit/integration/security checks pass; any skipped test has an explicit justification and documented manual replacement or blocker. No fabricated execution results.
- No known exploitable critical/high runtime vulnerability remains unresolved; other security findings have documented disposition and review. No silent downgrade of security settings.
- No unintended network access during local document processing; no sensitive document data in caches/logs; privacy claims reflect observed behaviour and limitations.
- Core existing functionality and new enabled features pass independent output validation. No destructive data-loss regressions.
- Supported Windows artifacts and web output build successfully. Trusted signed release requires valid Authenticode signatures; absence of signing identity is a release blocker for that signed channel, not permission to substitute a fake signature. Store package and third-party listings remain pending until external prerequisites and acceptance are verified.
- Licence/notice/SBOM/checksum/release documentation complete. Maintainer explicitly approves publishing; CI prepares draft artifacts only unless an authorised release procedure has been invoked.

If the environment cannot run Windows GUI, signing, offline traffic capture, independent PDF validation or screen-reader tests, implement and run what is possible and list exact unexecuted checks, commands and required environments. Mark those release gates **NOT VERIFIED**, not passed.

## 12. P1 — Documentation, distribution readiness and sustainability

Update existing README to serve nontechnical users first, then developers. Provide parallel English/French end-user documentation (e.g. `README.fr.md` or equivalent) with clear links and translated help, screenshots from actual app builds where possible, examples and honest limitations.

- Add a professional, lightweight bilingual product landing page (or separate route/page in the static deployment) with product description, actual screenshots, official download links, version/architecture/size, portable vs installer vs web explanations, source licence, privacy, help, support/security contacts and verification instructions. Download buttons must link only to actual released assets or a clearly labelled release page, not guessed binaries. Use the proposed GitHub Pages project URL only after deployment is verified. Preserve author credits; avoid unverifiable superlatives.
- Prepare release artifacts and descriptive metadata for GitHub Releases, GitHub Pages, SourceForge, AlternativeTo, PortableApps.com, WinGet, Scoop, FossHub and Microsoft Store, in priority order appropriate to the channel. Keep GitHub Releases canonical; mirrors must distribute the same verified version/bytes or clearly identify repackaged artifacts. Include checksums and provenance where appropriate. Do not create external accounts or submit listings without explicit approval.
- Prepare portable packaging notes for PortableApps.com Format and launcher/profile isolation; the existing electron-builder portable EXE is not automatically PortableApps-compatible. If implementing a `.paf.exe`, test portability, clean host behaviour, settings persistence and applicable format/licence requirements. Do not claim catalogue acceptance.
- Prepare WinGet manifests using actual version, publisher, product ID (verify availability), architecture, installer type/scope, exact URL/hash and silent install/uninstall behaviour. Validate with official tooling after final URLs are available. Scoop/Chocolatey manifests may follow if useful; do not guess final checksums or claim package IDs are registered. Document manual submission steps and prerequisites.
- Add end-user documentation: how to use each major tool, safe OCR/Office conversion, signature-image vs digital signature distinction, compression options, protected PDFs, redaction limitations, offline usage, verification, update/uninstall, accessibility shortcuts and troubleshooting. Include institutional IT deployment guidance and the warning that no-admin installation does not override an organisation's application controls.
- Add accurate `PRIVACY.md`/privacy policy (local processing, preferences, optional user-initiated browser links/model downloads, temp/profile behaviour, hosting logs where applicable, no telemetry), `CONTRIBUTING.md`, issue/PR templates, `SECURITY.md`, `CHANGELOG.md`, supported version policy and third-party notices. Keep private vulnerability reporting separate from public issues; use a maintainer-approved contact or GitHub private reporting if configured. Do not invent personal contact information or legal compliance guarantees.
- Provide a simple release impact measurement plan based on aggregate platform downloads and voluntary feedback, not in-app analytics. No active-user claims from download counts. Document support and maintenance responsibilities for the maintainer, including updating Electron and OCR dependencies.
- Consider later improvements (additional OCR languages, PDF/A validation, PDF accessibility/tag preservation, additional native platforms, ARM64, deeper Office conversion), but do not imply implemented support without testing. Keep the free/offline core intact.

## 13. Execution sequence, expected deliverables and handover

Work in small milestones. At the end of each milestone update `docs/distribution-readiness.md` and run the relevant regression checks. Use the repository's existing conventions for filenames; proposed names below are illustrative, not rigid requirements.

1. **Baseline and threat model:** inventory, audit, build/test evidence, architecture decisions, dependency/license/SBOM plan, prioritized backlog.
2. **P0 fixes:** secure renderer, navigation, IPC, CSP, network boundaries, resource handling, dependency fixes, core document integrity tests. Commit coherent changes.
3. **Core P1:** OCR engine and searchable-PDF output, OCR tests, compression, Unicode, productivity/accessibility features. Keep each feature independently reviewable; regressions must be fixed before advancing.
4. **Web/PWA and UX:** offline asset management, subpath build, local-first behaviour, accessibility and bilingual guides.
5. **Packaging/release:** portable + NSIS, signing integration, Store preparation, CI, SBOM/provenance, checksums, release documentation, draft artifacts. Never let missing external credentials block ordinary development builds; do block a claimed signed release.
6. **Conditional P2:** implement only supported and verifiable encryption/redaction/PDF signing; record architectural decisions and explicit deferrals for anything unsafe/incomplete.
7. **Final validation and handover:** run comprehensive tests, verify artifacts and independent outputs, compare metrics with baseline and prepare a pull-request-ready summary.

### Required repository deliverables

- Working, typed implementation integrated into the current architecture; existing features retained; bilingual resources updated.
- Unit/integration/E2E/security tests and synthetic fixtures with evidence of execution.
- Updated reproducible lockfile, package/build configuration, CI workflows and secure signing integration; no secrets.
- Actual generated local/CI artifacts if the environment supports them: NSIS and portable executables, web/PWA build, optional Store test/submission package, checksums, SBOM, notices and provenance. Keep large binaries out of Git; use approved CI artifacts/draft release mechanisms. If build unavailable, provide exact build/verification commands and logs showing the blocker.
- `docs/distribution-readiness.md`, threat model/security audit, release checklist, signing/setup instructions, OCR and compression benchmark report, relevant architecture decision records, bilingual user/developer documentation, privacy/security/support policy, distribution submission kit.
- Proposed changelog/version bump consistent with the project's versioning policy. Use a prerelease version for incomplete work; do not unilaterally declare `1.0.0` or publish tags. Preserve Apache-2.0 and author attribution.

### Final response format

Return a concise engineering handover, including:

1. Summary of implemented changes grouped by security, OCR/PDF capabilities, UX/accessibility, web, packaging/signing and distribution.
2. Baseline commit, branch, commit(s), important changed files and how the maintainer can run/review the work.
3. Current audit findings and remediation, unresolved security risks, licences and threat-model decisions.
4. Exact commands executed, exit codes, pass/fail/skip counts, benchmark results with environment and relevant artifact paths. Distinguish observed evidence from assumptions.
5. A gate matrix with `PASS`, `FAIL`, `BLOCKED`, `NOT VERIFIED` or `DEFERRED` for each release criterion. Do not report `PASS` for work only described in documentation.
6. Signing status of each executable/package; external prerequisites, exact maintainer actions and verification steps. Distinguish development unsigned builds, test-signed builds, trusted Authenticode and Store-managed signing.
7. Features or channels not implemented, rationale, risks, and proposed next steps. Explicitly identify any decisions made without maintainer input, including dependency substitutions, format trade-offs and scope changes.
8. Recommended release decision: `GO` for the verified channel only, `CONDITIONAL GO` for an explicitly approved and clearly labelled preview, or `NO-GO` with reasons. Do not publish, merge, spend money, create accounts, submit stores or share signing credentials as part of this task unless separately authorised.

## 14. Primary technical references to consult during implementation

Verify current documentation and supported versions before selecting dependencies or release channels; URLs are reference starting points, not claims of current eligibility or compatibility.

- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Electron support policy: https://www.electronjs.org/docs/latest/tutorial/electron-timelines
- Electron fuses: https://www.electronjs.org/docs/latest/tutorial/fuses
- Electron code signing: https://www.electronjs.org/docs/latest/tutorial/code-signing
- electron-builder documentation: https://www.electron.build/
- Microsoft SignTool: https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool
- Microsoft Store publishing: https://learn.microsoft.com/en-us/windows/apps/publish/
- MSIX documentation: https://learn.microsoft.com/en-us/windows/msix/
- WinGet manifest submissions: https://learn.microsoft.com/en-us/windows/package-manager/package/repository
- PDF.js: https://mozilla.github.io/pdf.js/ and https://github.com/mozilla/pdf.js
- pdf-lib: https://pdf-lib.js.org/
- Tesseract.js: https://github.com/naptha/tesseract.js
- Tesseract language data: https://github.com/tesseract-ocr/tessdata and https://github.com/tesseract-ocr/tessdata_fast
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- MDN PWA guides: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps
- GitHub Actions security hardening: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
- GitHub Releases: https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository
- GitHub Pages: https://docs.github.com/en/pages
- PortableApps development: https://portableapps.com/development
- Apache-2.0: https://www.apache.org/licenses/LICENSE-2.0

**Begin now with repository inspection, baseline checks and P0 remediation. Continue implementation in the sequence above. A written plan alone is not completion. Make honest, evidence-based decisions and preserve the project's local-first, inclusive mission throughout.**
