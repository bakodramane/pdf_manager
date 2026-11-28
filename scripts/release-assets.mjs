// Exact distribution contract shared by staging, checksums and draft creation.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function assetNames(version, signed) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }
  if (signed !== "true" && signed !== "false") throw new Error("Signing status must be true or false");
  const suffix = signed === "true" ? "" : "-UNSIGNED";
  return {
    windows: [
      `PDF Manager-${version}-portable${suffix}.exe`,
      `PDF Manager-${version}-Setup${suffix}.exe`,
    ],
    web: [
      `PDF-Manager-${version}-web.zip`,
      `PDF-Manager-${version}-sbom-shipped.cdx.json`,
      `PDF-Manager-${version}-sbom-build-tree.cdx.json`,
      `PDF-Manager-${version}-THIRD-PARTY-NOTICES.txt`,
    ],
  };
}

export function distributionNames(version, signed) {
  return Object.values(assetNames(version, signed)).flat().sort();
}

async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function validateDirectory(directory, expected) {
  if (!(await lstat(directory)).isDirectory()) throw new Error(`Not a directory: ${directory}`);
  const actual = await readdir(directory);
  const missing = expected.filter((name) => !actual.includes(name));
  const unexpected = actual.filter((name) => !expected.includes(name));
  if (missing.length || unexpected.length) {
    throw new Error(`Invalid assets in ${directory}: missing [${missing.join(", ")}]; unexpected [${unexpected.join(", ")}]`);
  }
  const hashes = new Map();
  for (const name of expected) {
    const path = join(directory, name);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size === 0) throw new Error(`Asset must be a non-empty regular file: ${path}`);
    const hash = await digest(path);
    if (hashes.has(hash)) throw new Error(`Duplicate asset contents: ${hashes.get(hash)} and ${name}`);
    hashes.set(hash, name);
  }
}

export async function stageAssets(incoming, directory, version, signed) {
  const groups = assetNames(version, signed);
  const entries = (await readdir(incoming)).sort();
  if (JSON.stringify(entries) !== JSON.stringify(Object.keys(groups).sort())) {
    throw new Error("Only windows and web artefact directories are allowed");
  }
  // Validate each source before copying: merging downloads can hide duplicates.
  for (const [group, names] of Object.entries(groups)) {
    await validateDirectory(join(incoming, group), names);
  }
  await mkdir(directory); // Refuse to reuse a potentially stale output directory.
  for (const [group, names] of Object.entries(groups)) {
    for (const name of names) await copyFile(join(incoming, group, name), join(directory, name));
  }
  await validateDirectory(directory, distributionNames(version, signed));
}

async function checksumText(directory, names) {
  const lines = [];
  for (const name of names) lines.push(`${await digest(join(directory, name))}  ${name}\n`);
  return lines.join("");
}

export async function writeChecksums(directory, version, signed) {
  const names = distributionNames(version, signed);
  await validateDirectory(directory, names);
  await writeFile(join(directory, "SHA256SUMS.txt"), await checksumText(directory, names), { flag: "wx" });
}

export async function verifyAssets(directory, version, signed) {
  const names = distributionNames(version, signed);
  await validateDirectory(directory, [...names, "SHA256SUMS.txt"]);
  const manifest = await readFile(join(directory, "SHA256SUMS.txt"), "utf8");
  // Exact comparison also rejects duplicate, missing, extra and unsafe manifest paths.
  if (manifest !== await checksumText(directory, names)) throw new Error("SHA-256 checksum manifest does not match final distribution assets");
  return [...names, "SHA256SUMS.txt"];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === "stage" && args.length === 4) await stageAssets(...args);
    else if (command === "checksums" && args.length === 3) await writeChecksums(...args);
    else if (command === "verify" && args.length === 3) await verifyAssets(...args);
    else throw new Error("Usage: release-assets.mjs stage <incoming> <assets> <version> <true|false> | checksums|verify <assets> <version> <true|false>");
    console.log(`Release assets: ${command} passed`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
