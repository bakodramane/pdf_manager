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
