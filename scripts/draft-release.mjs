import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyAssets } from "./release-assets.mjs";

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
}

export async function createDraft({ directory, version, signed, repo, sha }, runGh = gh) {
  const names = await verifyAssets(directory, version, signed);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[a-f0-9]{40}$/.test(sha)) throw new Error("Invalid repository or source SHA");
  const tag = `v${version}`;
  // List all pages: tag lookup alone is insufficient for detecting unpublished drafts.
  // Authentication/network/API errors propagate; they never mean 'release absent'.
  const pages = JSON.parse(runGh(["api", `repos/${repo}/releases?per_page=100`, "--paginate", "--slurp"]));
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) throw new Error("Invalid releases API response");
  const existing = pages.flat().filter((release) => release.tag_name === tag);
  if (existing.some((release) => release.draft !== true)) throw new Error(`Published release ${tag} exists; refusing to modify it. Use a new version.`);
  if (existing.length) throw new Error(`Draft release ${tag} exists; preserve its notes and evidence, confirm it is unpublished, then remove only that draft manually. See docs/release/checklist.md.`);

  const unsigned = signed === "false";
  const title = `PDF Manager ${version}${unsigned ? " (UNSIGNED)" : ""}`;
  const label = unsigned
    ? "UNSIGNED preview: Windows binaries are NOT code-signed. Verify SHA256SUMS.txt and build provenance before use."
    : "Windows binaries are Authenticode-signed (verify with signtool or Get-AuthenticodeSignature).";
  const notesDirectory = await mkdtemp(join(tmpdir(), "pdf-manager-release-"));
  try {
    const notes = join(notesDirectory, "notes.md");
    await writeFile(notes, `${label}\n\nSource commit: ${sha}\n\nSee CHANGELOG.md and docs/release/verify.md.\n`);
    // Create only: no edit, delete, upload --clobber or publish operation exists here.
    return runGh([
      "release", "create", tag, ...names.map((name) => join(directory, name)),
      "--repo", repo, "--draft", `--prerelease=${version.includes("-")}`,
      "--title", title, "--notes-file", notes, "--target", sha,
    ]);
  } finally {
    await rm(notesDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(await createDraft({
      directory: "assets", version: process.env.VERSION, signed: process.env.SIGNED,
      repo: process.env.GITHUB_REPOSITORY, sha: process.env.GITHUB_SHA,
    }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
