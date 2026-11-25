# Security policy

## Supported versions

| Version | Supported |
|---|---|
| Latest release (including the latest pre-release) | ✅ security fixes |
| Older releases | ❌ — please update |

The desktop app follows Electron's supported release lines; a release whose
Electron major has left support is itself unsupported.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Use GitHub's private vulnerability reporting for this repository
(*Security* tab → *Report a vulnerability*). If that option is not visible,
open an issue that only asks the maintainer for a private contact, without
details.

Include: affected version and edition (Windows portable / installer / web),
steps to reproduce, and impact. Synthetic test files are welcome; please do
not send real confidential documents.

This is a volunteer-maintained project: reports are handled as quickly as
the maintainer can, without a guaranteed response time. Fixed issues are
credited in the changelog unless you prefer otherwise.

## Scope notes

- PDF Manager processes documents locally and makes no network requests
  during processing. Findings that show data leaving the device are treated
  as high priority.
- Visual signatures, watermarks and page crops are **not** security
  features; reports asking for them to be secure are feature requests.
- Unsigned preview builds are labelled as such; SmartScreen warnings for them
  are expected.

See also `docs/security/threat-model.md` and
`docs/security/dependency-audit.md`.
