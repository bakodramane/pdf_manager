# 0008 — Cryptographic PDF signatures (deferred)

**Status.** Deferred. The app offers **visual signatures** (an image placed
on the page) and labels them as such. Existing digital signatures are
detected on load and the user is warned that exported files will not carry
a valid signature.

**Why.** A trustworthy implementation needs: incremental-update writing with
a reserved `/Contents` and exact `/ByteRange` (pdf-lib rewrites whole files),
CMS/PKCS#7 detached signatures from a user's PKCS#12 or a platform key store
(node-forge/PKI.js in the renderer would expose private keys to page code;
Windows CNG via the main process needs a native module and new IPC surface),
RFC 3161 timestamps and revocation checks (network calls needing explicit
consent), and validation that distinguishes valid/trusted/untrusted/expired/
altered/indeterminate. None of this can be verified to PAdES level here.

**Proposal.** Main-process signing service with a narrow IPC
(`sign(pdfBytes, certRef, options)`), keys never entering the renderer,
`@signpdf`-style placeholder + incremental update, validation with
`pdfsig` (Poppler) and Acrobat in CI fixtures with synthetic test
certificates only. Until then, no "Digitally sign" button exists.
