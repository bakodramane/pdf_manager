# 0006 — PDF password protection (deferred)

**Status.** Deferred. The app detects encrypted PDFs and refuses to edit them
with a clear message; it never tries to bypass encryption.

**Why.** pdf-lib cannot decrypt or encrypt. PDF.js can decrypt for viewing
but not write. Interoperable AES-256 (revision 6) encryption needs a
maintained writer with verified key derivation; candidates are qpdf compiled
to WebAssembly (Apache-2.0, mature; ≈ 1–2 MB WASM, needs a careful wrapper)
or a small pure-JavaScript encryptor (none was evaluated in depth here). Shipping either without
interoperability tests in Acrobat, Poppler and pdf.js would risk false
security claims.

**Proposal for a later release.** qpdf-wasm in a worker: `--encrypt user
owner 256` only (no RC4/AES-128 downgrade), passwords held in memory for the
call only, never logged; tests: open with `qpdf --check`, Poppler and PDF.js
with the password, refuse without; UI wording that permission flags are not
access control.
