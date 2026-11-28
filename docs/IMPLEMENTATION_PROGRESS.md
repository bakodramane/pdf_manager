# Release asset selection correction

- Scope: restrict release inputs, validate seven final assets, preserve signing
  labels and provenance, classify pre-releases and block existing releases.
- Base: `1ffc2c901420d50c81803d801eb62f1238aa3d80` (`main`).
- Branch: `fix/release-asset-selection`.
- Milestone 1: exact asset contract, checksum and draft safety helpers complete.
  `node --test scripts/release.test.mjs`: 18 passed; targeted ESLint and
  `git diff --check`: passed.
- Milestone 2: workflow integration and release documentation pending.
- Milestone 3: final validation, external checkpoint and pull request pending.
- Decision: block both existing drafts and published releases. Replacement of an
  unpublished draft requires maintainer review and manual removal; the workflow
  never edits, deletes or publishes a release.
- Native packaging, signing and hosted attestations require the release workflow;
  no release run or publication is authorised as part of this correction.
