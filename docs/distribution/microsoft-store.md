# Microsoft Store (separate channel — not prepared as a package yet)

- electron-builder's `appx` target produces an MSIX/AppX package and needs
  the **identity values assigned by Partner Center** (`identityName`,
  `publisher` = `CN=…` of the Partner Center publisher, `publisherDisplayName`).
  These must not be guessed; leave the target out of `electron-builder.yml`
  until the account exists.
- The Store re-signs submitted packages. Store signing covers **only** the
  Store download; GitHub portable/NSIS files still need their own
  Authenticode signature.
- Capabilities: none beyond `runFullTrust` (required by Electron desktop
  apps). No internet capability is needed for the app's function.
- Listing: bilingual copy in `README.md` of this folder; privacy policy URL
  (`PRIVACY.md` published on Pages or GitHub); support URL (`SUPPORT.md`).
- Check current Partner Center fees, identity verification and individual
  developer eligibility on Microsoft's site before committing; nothing was
  registered or paid.
- Local test: build with a test certificate on a developer machine, install
  with `Add-AppxPackage`, test install/update/uninstall offline. Never ship
  the test certificate.
