# Distribution kit

GitHub Releases is the canonical source. Every other channel must carry the
same bytes (same SHA-256) or say clearly that it repackages them. Nothing in
this folder has been submitted anywhere; each channel needs the maintainer's
own account and approval.

| Priority | Channel | Status | Notes |
|---|---|---|---|
| 1 | GitHub Releases | workflow ready (`release.yml`, drafts only) | canonical |
| 2 | GitHub Pages (web edition) | workflow ready (`pages.yml`, manual) | enable Pages first |
| 3 | WinGet | template in `winget/` | needs a final release URL and hash; validate with `winget validate` |
| 4 | Scoop | template `scoop-pdf-manager.json` | extras bucket or own bucket |
| 5 | SourceForge mirror | not started | mirror the GitHub release files unchanged |
| 6 | AlternativeTo | listing copy below | listing, no binaries |
| 7 | PortableApps.com | notes in `portableapps.md` | needs a `.paf.exe` (not built) |
| 8 | FossHub | not started | apply on their site |
| 9 | Microsoft Store | notes in `microsoft-store.md` | Partner Center account and MSIX needed |

## Listing copy

**EN — short:** Free, open-source PDF editor that works entirely on your
device, in English and French. No account, no uploads.

**EN — long:** PDF Manager organises, merges, splits, annotates, fills in,
compresses and converts PDFs, and recognises text in scanned pages (English
and French) — all offline on Windows, or in the browser with nothing
uploaded. Apache-2.0 licensed, no advertising, no tracking.

**FR — court :** Éditeur de PDF libre et gratuit qui fonctionne entièrement
sur votre appareil, en français et en anglais. Sans compte, sans envoi de
fichiers.

**FR — long :** PDF Manager organise, fusionne, découpe, annote, remplit,
compresse et convertit les PDF, et reconnaît le texte des pages numérisées
(français et anglais) — hors ligne sur Windows, ou dans le navigateur sans
rien envoyer. Licence Apache-2.0, sans publicité ni pistage.

Avoid unverifiable superlatives ("best", "most secure"). Use real
screenshots from a release build.

## Measuring impact without tracking

- Aggregate download counts from GitHub Releases (API
  `GET /repos/{owner}/{repo}/releases`, `assets[].download_count`), WinGet
  and mirror statistics where offered, monthly.
- GitHub Pages traffic is not measured by the app; repository traffic
  graphs give rough visitor numbers.
- Voluntary feedback: GitHub Discussions/issues, an optional feedback link in
  release notes.
- Downloads are not users: never report download counts as active users.
- No in-app analytics, ever, without a separate opt-in design decision.
