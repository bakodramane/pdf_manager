# Preparing a draft release

The `Release (draft)` workflow runs the reusable CI checks, packages Windows
x64 Portable and per-user NSIS executables, and packages the web edition.
It creates an unpublished **draft** for maintainer review. Publication is manual.
Versions containing a pre-release suffix, including `alpha`, `beta` and `rc`,
are automatically marked as GitHub pre-releases. Stable versions are not.
The tag, when provided, must match `v` plus `package.json`'s version.

## Exact asset contract

For version `<version>`, the draft contains **seven uploaded assets**:

| File | Purpose |
| --- | --- |
| `PDF-Manager-<version>-portable<suffix>.exe` | Portable Windows x64 executable |
| `PDF-Manager-<version>-Setup<suffix>.exe` | Per-user NSIS Windows x64 installer |
| `PDF-Manager-<version>-web.zip` | Web distribution |
| `PDF-Manager-<version>-sbom-shipped.cdx.json` | Shipped-component SBOM |
| `PDF-Manager-<version>-sbom-build-tree.cdx.json` | Build dependency SBOM |
| `PDF-Manager-<version>-THIRD-PARTY-NOTICES.txt` | Third-party notices |
| `SHA256SUMS.txt` | SHA-256 digests of the six files above |

`<suffix>` is `-UNSIGNED` when signing is disabled and empty when signing is
enabled. Unsigned drafts also include `UNSIGNED` in the title and release notes.
The versioned build-tree SBOM is an intentional distribution asset; raw internal
CI metadata is not. GitHub's automatically generated source archives are separate
from these seven uploaded assets. Provenance is stored through GitHub attestations,
not uploaded as an eighth release asset.

The draft job downloads only the named `windows` and `web` artefacts into separate
directories. `scripts/release-assets.mjs` enforces exact names, signing labels,
version and file counts before staging. It rejects extra, missing, empty, nested,
non-regular or duplicate-content files. It never merges or silently filters inputs.
The Windows upload explicitly selects the two target executables. CI's
`UNSIGNED-dev-windows-x64`, `build-meta`, unpacked application binaries, blockmaps
and other internal outputs never become release assets.

Staging changes the Windows filename prefix from `PDF Manager-` to `PDF-Manager-`
before hashing, avoiding GitHub's automatic space-to-dot filename sanitisation.
Checksums are generated after final renaming over only the six distribution files.
The manifest never hashes itself. A separate step verifies the exact seven-file
inventory and manifest, then checks every digest with `sha256sum --strict -c`.
The existing SHA-pinned provenance action attests all seven final files, including
the checksum manifest. Draft creation revalidates the assets immediately before
uploading the explicit list.

## Running and reviewing

1. Follow the [maintainer checklist](checklist.md), including the existing-release
   check. Review the source commit and CI results.
2. Dispatch `Release (draft)` on the intended commit. Leave `signed` false for an
   explicitly unsigned preview, or configure [signing](signing.md) before selecting
   true. Tag-triggered runs never opt into signing implicitly.
3. Review the seven assets, [checksums and provenance](verify.md), pre-release
   flag and platform acceptance tests before publishing manually.

The job retains read-only permissions by default and grants only the draft job
release/attestation write permissions and OIDC access. Checkout credentials remain
disabled, release runs are serialised, and signing environments, signature checks,
CI gates and SHA-pinned actions remain in place.

The workflow refuses to change any existing release for that version. API or
authentication failures also stop creation. See the checklist for safe recovery
from a partial upload or replacement of an incorrect unpublished draft.
