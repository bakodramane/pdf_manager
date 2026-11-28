import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assetNames, distributionNames, stageAssets, verifyAssets, writeChecksums } from "./release-assets.mjs";
import { createDraft } from "./draft-release.mjs";

const version = "0.2.0-beta.1";
const sha = "a".repeat(40);

async function fixture(t, signed = "false", releaseVersion = version) {
  const root = await mkdtemp(join(tmpdir(), "pdf-manager-assets-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const incoming = join(root, "incoming");
  const directory = join(root, "assets");
  for (const [group, names] of Object.entries(assetNames(releaseVersion, signed))) {
    await mkdir(join(incoming, group), { recursive: true });
    for (const name of names) await writeFile(join(incoming, group, name), `fixture: ${name}`);
  }
  return { incoming, directory, version: releaseVersion, signed, repo: "bakodramane/pdf_manager", sha };
}

async function prepared(t, signed, releaseVersion) {
  const options = await fixture(t, signed, releaseVersion);
  await stageAssets(options.incoming, options.directory, options.version, options.signed);
  await writeChecksums(options.directory, options.version, options.signed);
  return options;
}

for (const signed of ["true", "false"]) {
  test(`stages exactly seven final assets; signed=${signed}`, async (t) => {
    const options = await prepared(t, signed);
    const names = await verifyAssets(options.directory, version, signed);
    assert.equal(names.length, 7);
    assert.equal(names.filter((name) => name.endsWith(".exe")).length, 2);
    assert.equal(names.filter((name) => name.endsWith("-UNSIGNED.exe")).length, signed === "false" ? 2 : 0);
    const manifest = await readFile(join(options.directory, "SHA256SUMS.txt"), "utf8");
    assert.equal(manifest.trim().split("\n").length, 6);
    assert.ok(!manifest.includes("SHA256SUMS.txt"));
    await assert.rejects(writeChecksums(options.directory, version, signed));
  });
}

for (const extra of ["bundled-packages.json", "sbom-shipped.cdx.json", "duplicate.exe", "PDF Manager-0.2.0-beta.1-Setup.exe"]) {
  test(`rejects unexpected input: ${extra}`, async (t) => {
    const options = await fixture(t);
    await writeFile(join(options.incoming, "windows", extra), "unexpected");
    await assert.rejects(stageAssets(options.incoming, options.directory, version, "false"), /unexpected/);
  });
}

test("rejects foreign artefacts, missing assets, nested and empty files", async (t) => {
  const options = await fixture(t);
  const stage = () => stageAssets(options.incoming, options.directory, version, "false");
  const foreign = join(options.incoming, "UNSIGNED-dev-windows-x64");
  await mkdir(foreign);
  await assert.rejects(stage(), /Only windows and web/);
  await rm(foreign, { recursive: true });
  const file = join(options.incoming, "windows", assetNames(version, "false").windows[0]);
  await rm(file);
  await assert.rejects(stage(), /missing/);
  await mkdir(file);
  await assert.rejects(stage(), /regular file/);
  await rm(file, { recursive: true });
  await writeFile(file, "");
  await assert.rejects(stage(), /non-empty/);
});

test("rejects duplicate executable contents and stale staging directories", async (t) => {
  const options = await fixture(t);
  const files = assetNames(version, "false").windows.map((name) => join(options.incoming, "windows", name));
  await writeFile(files[1], await readFile(files[0]));
  await assert.rejects(stageAssets(options.incoming, options.directory, version, "false"), /Duplicate/);
  await writeFile(files[1], "installer");
  await mkdir(options.directory);
  await assert.rejects(stageAssets(options.incoming, options.directory, version, "false"), /EEXIST/);
});

test("rejects signed filenames when signing is disabled", async (t) => {
  const options = await fixture(t, "true");
  await assert.rejects(stageAssets(options.incoming, options.directory, version, "false"), /missing.*UNSIGNED/);
});

test("rejects tampered bytes, incomplete/duplicate manifests and unexpected final files", async (t) => {
  const options = await prepared(t);
  const verify = () => verifyAssets(options.directory, version, "false");
  const manifestPath = join(options.directory, "SHA256SUMS.txt");
  const manifest = await readFile(manifestPath, "utf8");
  for (const invalid of [manifest.split("\n").slice(1).join("\n"), manifest + manifest.split("\n")[0] + "\n"]) {
    await writeFile(manifestPath, invalid);
    await assert.rejects(verify(), /checksum manifest/);
  }
  await writeFile(manifestPath, manifest);
  const extra = join(options.directory, "metadata.json");
  await writeFile(extra, "extra");
  await assert.rejects(verify(), /unexpected/);
  await rm(extra);
  const file = join(options.directory, distributionNames(version, "false")[0]);
  await writeFile(file, "tampered");
  await assert.rejects(verify(), /checksum manifest/);
  await rename(file, `${file}.duplicate`);
  await assert.rejects(verify(), /missing.*unexpected/);
});

for (const releaseVersion of ["1.0.0-alpha.1", "1.0.0-beta.2", "1.0.0-rc.1", "1.0.0"]) {
  test(`creates only a draft with correct prerelease flag: ${releaseVersion}`, async (t) => {
    const options = await prepared(t, "false", releaseVersion);
    const calls = [];
    await createDraft(options, (args) => {
      calls.push(args);
      return args[0] === "api" ? "[[], []]" : "draft URL";
    });
    assert.equal(calls.length, 2);
    assert.ok(calls[0].includes("--paginate"));
    assert.ok(calls[0].includes("--slurp"));
    const create = calls[1];
    assert.deepEqual(create.slice(0, 3), ["release", "create", `v${releaseVersion}`]);
    assert.ok(create.includes("--draft"));
    assert.ok(create.includes(`--prerelease=${releaseVersion.includes("-")}`));
    assert.ok(create.includes(`PDF Manager ${releaseVersion} (UNSIGNED)`));
    assert.equal(create.filter((arg) => arg.startsWith(options.directory)).length, 7);
  });
}

for (const draft of [true, false]) {
  test(`existing ${draft ? "draft" : "published"} release blocks all writes`, async (t) => {
    const options = await prepared(t);
    const calls = [];
    await assert.rejects(createDraft(options, (args) => {
      calls.push(args);
      return JSON.stringify([[], [{ tag_name: `v${version}`, draft }]]);
    }), draft ? /Draft release.*manually/ : /Published release.*refusing/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "api");
  });
}

test("API failures and malformed responses block draft creation", async (t) => {
  const options = await prepared(t);
  await assert.rejects(createDraft(options, () => { throw new Error("API unavailable"); }), /API unavailable/);
  for (const response of ["not JSON", "{}", "[{}]"]) {
    await assert.rejects(createDraft(options, () => response));
  }
});

test("rejects unsafe version and signing inputs", () => {
  for (const invalid of ["../1.0.0", "1.0.0\n", "01.0.0", "1.0.0;echo hello"]) {
    assert.throws(() => assetNames(invalid, "false"), /Invalid release version/);
  }
  assert.throws(() => assetNames(version, ""), /Signing status/);
});
