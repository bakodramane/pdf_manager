// @vitest-environment node
/**
 * Guard against "Trojan Source"-style invisible characters in the code base:
 * bidirectional overrides, zero-width characters, BOMs and NUL bytes must be
 * written as escapes (e.g. "\u202e"), never as raw characters.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..");
const SCAN = ["src", "electron", "e2e", "scripts", "build", "docs", ".github"];
const EXT = /\.(ts|tsx|cjs|mjs|js|json|css|html|md|yml|yaml|nsh)$/;
// eslint-disable-next-line no-control-regex
const BAD = /[\u0000\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;

function* files(dir: string): Generator<string> {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (EXT.test(name)) yield p;
  }
}

describe("source hygiene", () => {
  it("contains no raw bidi-control, zero-width, BOM or NUL characters", () => {
    const offenders: string[] = [];
    for (const top of SCAN) {
      for (const f of files(join(ROOT, top))) {
        if (BAD.test(readFileSync(f, "utf8"))) offenders.push(relative(ROOT, f));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("packaging", () => {
  it("keeps package.json dependencies empty (electron-builder would copy them into the app)", () => {
    // Everything the renderer needs is bundled by Vite or copied into dist/
    // by scripts/copy-assets.mjs; node_modules must not be packaged.
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it("keeps Poppler strictly a development/testing dependency (never required by shipped builds)", () => {
    const popplerRef = /\b(pdftotext|pdfinfo|pdftoppm|poppler)\b/i;
    const offenders: string[] = [];

    // Shipped renderer and Electron runtime code (excluding test files and test helpers).
    for (const top of ["src", "electron"]) {
      for (const f of files(join(ROOT, top))) {
        const rel = relative(ROOT, f).replace(/\\/g, "/");
        if (rel.startsWith("src/test/") || /\.test\.(ts|tsx|js|cjs|mjs)$/.test(rel)) continue;
        if (popplerRef.test(readFileSync(f, "utf8"))) offenders.push(rel);
      }
    }

    // Shipped asset pipeline and Electron packaging configuration.
    for (const rel of ["scripts/copy-assets.mjs", "scripts/third-party-notices.mjs", "electron-builder.yml"]) {
      if (popplerRef.test(readFileSync(join(ROOT, rel), "utf8"))) offenders.push(rel);
    }

    expect(offenders).toEqual([]);
  });
});
