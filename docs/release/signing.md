# Windows release signing

Signing is an explicit manual `signed` workflow input. It defaults to false;
tag pushes do not opt in. Unsigned builds use the `release-unsigned` environment
and retain `UNSIGNED` filenames, release title and notes.

Signed builds use the protected `release-signing` environment. Configure required
reviewers and the provider's authentication there. The provider-neutral hook is
`build/sign.cjs`; its documented environment variables select Windows SDK
`signtool`, certificate/provider arguments, RFC 3161 timestamp URL and publisher.
Never commit keys or credentials. If a provider requires a login action, add and
review that integration with a full SHA pin before enabling signing.

`PDFM_REQUIRE_SIGNING=1` makes missing or failing signing fatal. After packaging,
`scripts/verify-signatures.ps1 -Path release -RequireSigned` verifies signatures
and, when configured, the expected publisher. Do not remove this gate or replace
it with a self-signed certificate. Both Portable and NSIS wrapper signatures must
be checked again during [maintainer review](checklist.md).
