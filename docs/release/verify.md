# Verifying release downloads

Download the seven uploaded files listed in the [release asset contract](README.md)
from the intended GitHub release into a new directory. Confirm the version,
filenames, signing labels and source commit before use.

## SHA-256

On Linux, or in a shell with GNU coreutils, change to the download directory:

```sh
sha256sum --strict -c SHA256SUMS.txt
```

Expect six `OK` results. The manifest covers the two final executables, web ZIP,
two SBOMs and notices. It does not cover itself or any internal CI files.

On Windows PowerShell, compute each downloaded file's hash and compare it with
the corresponding entry in `SHA256SUMS.txt`, for example:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath './PDF-Manager-0.2.0-beta.1-portable-UNSIGNED.exe'
```

Checksums detect changed bytes. Verify provenance as well; a manifest downloaded
from the same compromised location cannot by itself establish the publisher.

## Build provenance

With an authenticated GitHub CLI supporting attestations, verify **each** of the
seven files, including `SHA256SUMS.txt`:

```sh
gh attestation verify '<downloaded-file>' --repo bakodramane/pdf_manager --signer-workflow bakodramane/pdf_manager/.github/workflows/release.yml
```

Inspect the verification output and confirm the source repository, workflow and
commit match the intended release build. The workflow attests only the validated
final assets. No separate attestation bundle is added to the seven release files.

## Windows signatures

For a signed candidate, check both `.exe` files with `Get-AuthenticodeSignature`
or `signtool verify /pa /v` and confirm the intended publisher. For an unsigned
preview, both filenames must end in `-UNSIGNED.exe` and its draft title/notes must
say `UNSIGNED`. Checksums and GitHub provenance do not turn an unsigned executable
into an Authenticode-signed release.
