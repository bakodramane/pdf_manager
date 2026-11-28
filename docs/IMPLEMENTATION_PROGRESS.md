# Release asset selection correction

- Scope: restrict release inputs, validate seven final assets, preserve signing
  labels and provenance, classify pre-releases and block existing releases.
- Base: `1ffc2c901420d50c81803d801eb62f1238aa3d80` (`main`).
- Branch: `fix/release-asset-selection`.
- Milestone 1: exact asset contract, checksum and draft safety helpers complete.
  `node --test scripts/release.test.mjs`: 18 passed; targeted ESLint and
  `git diff --check`: passed.
- Milestone 1 external checkpoint: `5d04d39099eec25392e6c85762c4ff4a241a1b29`
  verified with `git ls-remote` on `origin/fix/release-asset-selection`.
- Milestone 2: workflow integration and release documentation complete.
  `node --test scripts/release.test.mjs`: 21 passed; `npm run lint`,
  `npm run typecheck`, YAML parsing and `git diff --check`: passed.
  Downloads use separate, explicitly named inputs; Windows
  uploads use exact Portable/Setup names. Added the previously missing release
  guides linked from the README, including the maintainer replacement procedure.
  The output ignore rule was anchored to `/release/` so it no longer hides
  `docs/release/` from Git.
- Observed via the releases API: `v0.2.0-beta.1` (release ID `461619565`) is an
  unpublished draft with 12 assets and `prerelease: false`; left untouched.
  GitHub replaced spaces in executable names with dots. Staging now chooses
  space-free `PDF-Manager-` executable names before hashing so downloads match
  the checksum manifest.
- Milestone 2 workflow checkpoint: `81d5d45db2ab5c752ad30907cc5d3df7e7bac09a`
  verified with `git ls-remote` on `origin/fix/release-asset-selection`.
- Milestone 3 validation: actionlint 1.7.12 passed for `release.yml` and `ci.yml`
  (downloaded Windows binary verified against upstream SHA-256 checksums).
  The exact PowerShell labelling step passed on synthetic executables. GNU
  `sha256sum --strict -c SHA256SUMS.txt` verified six files for each of the signed
  and unsigned fixtures. No production executables were created or modified.
- Final documentation checkpoint and pull request pending; full hosted packaging,
  Authenticode signing and GitHub attestation generation were not run locally.
- Decision: block both existing drafts and published releases. Replacement of an
  unpublished draft requires maintainer review and manual removal; the workflow
  never edits, deletes or publishes a release.
- Native packaging, signing and hosted attestations require the release workflow;
  no release run or publication is authorised as part of this correction.
