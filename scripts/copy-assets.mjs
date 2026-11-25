// Copies runtime assets from node_modules into public/ so the app never
// fetches them from a CDN. Runs before `dev`, `build` and `test`
// (package.json "pre*" scripts). The copies are git-ignored: they always match
// the installed, lockfile-pinned package versions.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");
const pub = join(root, "public");

/** [source dir in node_modules, destination dir in public] */
const COPIES = [
  ["pdfjs-dist/cmaps", "pdfjs/cmaps"],
  ["pdfjs-dist/standard_fonts", "pdfjs/standard_fonts"],
  ["pdfjs-dist/wasm", "pdfjs/wasm"],
  ["pdfjs-dist/iccs", "pdfjs/iccs"],
];

for (const [from, to] of COPIES) {
  const src = join(nm, from);
  const dest = join(pub, to);
  if (!existsSync(src)) {
    console.error(`copy-assets: missing ${src} — run npm ci first.`);
    process.exit(1);
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}
console.log(`copy-assets: copied ${COPIES.length} asset folders into public/.`);
