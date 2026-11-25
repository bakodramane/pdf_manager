# PortableApps.com notes

The electron-builder `portable` target is a self-extracting single `.exe`:
it unpacks to a temporary folder on each start and keeps Chromium's profile
in `%APPDATA%`, so it is **not** PortableApps.com Format compliant.

A compliant package would need:

- `PDFManagerPortable/App/PDFManager/` with the unpacked app (`win-unpacked`),
- `App/AppInfo/appinfo.ini` and icons, a PortableApps.com Launcher
  (`PDFManagerPortable.exe`) that passes `--user-data-dir=Data\profile`
  (or sets `ELECTRON` user data via the launcher) so nothing is written to
  the host,
- `Other/Source/` with licence and source pointers,
- packaging with the PortableApps.com Installer into `.paf.exe`, then
  testing on a clean host that no files remain outside the folder.

Note: `app.setPath("userData", …)` support for a portable data folder would
need a small, reviewed main-process change (read only a fixed relative path
next to the executable, never a path from the environment). Not done yet.
Catalogue acceptance is decided by PortableApps.com; nothing has been
submitted.
