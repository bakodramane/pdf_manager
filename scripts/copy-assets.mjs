// Copies runtime assets from node_modules into public/ so the app never
// fetches them from a CDN. Runs before `dev`, `build` and `test`
// (package.json "pre*" scripts). The copies are git-ignored: they always
// match the installed, lockfile-pinned package versions.
//
// Integrity: the OCR engine, language models and fonts are verified against
// SHA-256 digests committed in scripts/asset-digests.json. A mismatch fails
// the build. After a deliberate upgrade, refresh the digests with
//   npm run assets -- --update-digests
// and review the diff of asset-digests.json in the pull request.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");
const pub = join(root, "public");
const digestFile = join(root, "scripts", "asset-digests.json");
const updateDigests = process.argv.includes("--update-digests");

const pkgVersion = (name) => JSON.parse(readFileSync(join(nm, name, "package.json"), "utf8")).version;

/** Whole folders: [source dir in node_modules, destination dir in public] */
const FOLDERS = [
  ["pdfjs-dist/cmaps", "pdfjs/cmaps"],
  ["pdfjs-dist/standard_fonts", "pdfjs/standard_fonts"],
  ["pdfjs-dist/wasm", "pdfjs/wasm"],
  ["pdfjs-dist/iccs", "pdfjs/iccs"],
];

/** Single files (digest-verified): [source in node_modules, destination in public] */
const FILES = [
  // OCR engine (Tesseract.js worker + LSTM-only WebAssembly cores).
  ["tesseract.js/dist/worker.min.js", "ocr/worker.min.js"],
  ["tesseract.js/dist/worker.min.js.LICENSE.txt", "ocr/worker.min.js.LICENSE.txt"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "ocr/core/tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "ocr/core/tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["tesseract.js-core/LICENSE", "ocr/core/LICENSE"],
  // Language models (tessdata "best_int" LSTM models, Apache-2.0).
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "ocr/lang/eng.traineddata.gz"],
  ["@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz", "ocr/lang/fra.traineddata.gz"],
  // Unicode font embedded in exported PDFs (OCR text layer, annotations).
  ["@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf", "fonts/NotoSans-Regular.ttf"],
  ["@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf", "fonts/NotoSans-Bold.ttf"],
  ["@expo-google-fonts/noto-sans/400Regular_Italic/NotoSans_400Regular_Italic.ttf", "fonts/NotoSans-Italic.ttf"],
  ["@expo-google-fonts/noto-sans/700Bold_Italic/NotoSans_700Bold_Italic.ttf", "fonts/NotoSans-BoldItalic.ttf"],
  ["@expo-google-fonts/noto-sans/LICENSE_FONT", "fonts/OFL.txt"],
];

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function fail(message) {
  console.error(`copy-assets: ${message}`);
  process.exit(1);
}

for (const [from, to] of FOLDERS) {
  const src = join(nm, from);
  const dest = join(pub, to);
  if (!existsSync(src)) fail(`missing ${src} — run npm ci first.`);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

const expected = existsSync(digestFile) ? JSON.parse(readFileSync(digestFile, "utf8")) : {};
const actual = {};
rmSync(join(pub, "ocr"), { recursive: true, force: true });
rmSync(join(pub, "fonts"), { recursive: true, force: true });
for (const [from, to] of FILES) {
  const src = join(nm, from);
  if (!existsSync(src)) fail(`missing ${src} — run npm ci first.`);
  const digest = sha256(src);
  actual[to] = digest;
  if (!updateDigests) {
    if (!expected[to]) fail(`no committed digest for ${to}. Run: npm run assets -- --update-digests`);
    if (expected[to] !== digest) {
      fail(`digest mismatch for ${to}\n  expected ${expected[to]}\n  actual   ${digest}`);
    }
  }
  const dest = join(pub, to);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}

if (updateDigests) {
  writeFileSync(digestFile, `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`copy-assets: wrote ${Object.keys(actual).length} digests to scripts/asset-digests.json`);
}

// Sizes and versions shown in the OCR panel and used by the web edition's
// "prepare for offline use" button.
const size = (p) => statSync(join(pub, p)).size;
const ocrManifest = {
  engine: { name: "tesseract.js", version: pkgVersion("tesseract.js"), core: pkgVersion("tesseract.js-core") },
  languages: {
    eng: { file: "lang/eng.traineddata.gz", bytes: size("ocr/lang/eng.traineddata.gz"), model: "tessdata 4.0.0 best_int" },
    fra: { file: "lang/fra.traineddata.gz", bytes: size("ocr/lang/fra.traineddata.gz"), model: "tessdata 4.0.0 best_int" },
  },
  engineFiles: FILES.filter(([, to]) => to.startsWith("ocr/") && !to.startsWith("ocr/lang/") && !to.endsWith("LICENSE") && !to.endsWith(".txt"))
    .map(([, to]) => ({ file: to.slice("ocr/".length), bytes: size(to) })),
};
writeFileSync(join(pub, "ocr", "manifest.json"), `${JSON.stringify(ocrManifest, null, 2)}\n`);

console.log(`copy-assets: copied ${FOLDERS.length} folders and ${FILES.length} verified files into public/.`);
