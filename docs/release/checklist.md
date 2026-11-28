# Maintainer release checklist

## Before preparing a draft

- [ ] Confirm the intended commit, `package.json`/lockfile version, changelog and,
  if using a tag, matching `v<version>` tag. Never move a published version's tag.
- [ ] Review CI, dependency/security gates, supported platform evidence and known
  limitations in [distribution readiness](../distribution-readiness.md).
- [ ] Run `node --test scripts/release.test.mjs` and the normal lint/type checks.
- [ ] Inspect Releases for this exact version. An existing published release blocks
  reuse: choose a new version. An existing draft also blocks the workflow; follow
  the replacement procedure below before starting another run.
- [ ] Choose signing deliberately. For unsigned previews expect `-UNSIGNED.exe`
  on both executables and `UNSIGNED` in the draft title and notes. For signed
  candidates configure the protected `release-signing` environment and reviewers,
  then select `signed: true`; missing/invalid signing must fail closed.

## Review the generated draft

- [ ] Confirm the source SHA and successful `Release (draft)` run. Do not rely on
  CI development packages as release candidates.
- [ ] Count exactly **seven uploaded assets**, matching the
  [asset contract](README.md#exact-asset-contract), including exactly one Portable
  and one NSIS installer. There must be no duplicate executables, raw CI metadata,
  blockmaps or unpacked app binaries.
- [ ] Check the asset-validation and separate checksum-verification steps passed.
  Download the final assets and [verify checksums and all seven attestations](verify.md).
  Confirm six distinct distribution entries in `SHA256SUMS.txt`, with no self-entry.
- [ ] Check `alpha`, `beta` and `rc` versions are marked **pre-release**; stable
  versions should not be. Confirm the release is still a **draft**.
- [ ] For signed builds independently verify both executable signatures and the
  intended publisher. Provenance and checksums do not replace Authenticode signing.
- [ ] Test Portable launch and NSIS install/uninstall as a standard user on the
  supported Windows platforms, including paths with accents, offline use and OCR.
  Test the packaged web edition and record results and limitations.
- [ ] Record source commit, workflow URL, asset hashes, build environment, platform
  evidence and signing status. Review release notes and rollback guidance.
- [ ] Publish manually only after maintainer approval. This workflow never publishes.

## Replacing the incorrect unpublished draft

The first successful run included 12 uploaded files because the draft job merged
all artefacts, including `build-meta` and `UNSIGNED-dev-windows-x64`. Do not publish
that draft or selectively rename/re-hash its mixed files.

1. Merge the correction and select a commit that contains it for the next run.
   Re-running an old workflow run uses its old workflow definition; start a fresh
   manual run on the corrected commit instead. Do not move an existing tag.
2. Stop any concurrent manual release activity. Inspect the exact release in the
   GitHub UI and confirm it is still an **unpublished draft**. Preserve its notes,
   source SHA, run URL and asset inventory/hashes outside the temporary runner;
   retain any unique evidence needed for audit or comparison.
3. Immediately recheck the draft status. A maintainer may then delete **only that
   draft release** using the UI. Keep its source tag if one exists. The workflow
   never deletes releases or tags and does not use asset overwrite/clobber options.
   If it has been published, **stop**: do not delete, overwrite or revert it to a
   draft; prepare a new version instead.
4. Start a fresh `Release (draft)` run with the intended signing choice. Existing
   releases are checked across all API pages immediately before creation; any
   draft/published match or API failure stops the upload. Never bypass that guard.
5. Review the new draft using every check above. Expect seven uploaded assets and,
   for the current beta, the pre-release flag. Leave it unpublished until approved.

A failed upload can leave an incomplete draft. Treat it the same way: preserve
evidence, confirm it remains unpublished, remove only that draft manually and run
the corrected workflow afresh. Never blindly rerun or overwrite assets in place.
