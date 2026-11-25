# WinGet manifest (template)

`manifests/` holds a **template** for the per-user NSIS installer. Before
submitting to `microsoft/winget-pkgs`:

1. Publish a release; take the final installer URL from GitHub.
2. Replace `<VERSION>`, `<URL>` and `<SHA256>` (from `SHA256SUMS.txt`).
3. Check the identifier `DBako.PDFManager` is free:
   `winget search --id DBako.PDFManager`.
4. `winget validate <folder>` then `winget install --manifest <folder>` on a
   clean VM; confirm silent install/uninstall works per-user without
   elevation.
5. Submit a pull request to winget-pkgs (maintainer's GitHub account).

Unsigned installers can be submitted, but SmartScreen/Defender reputation
may cause validation friction; a signed release is recommended.
