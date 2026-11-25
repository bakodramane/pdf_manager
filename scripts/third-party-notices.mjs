// Writes dist/THIRD-PARTY-NOTICES.txt (shipped with the web and desktop
// editions) and build-meta/licenses.json from:
//  - build-meta/bundled-packages.json (packages Vite actually bundled), plus
//    their production dependency closure (prebuilt bundles such as ExcelJS
//    and docx inline their own dependencies);
//  - packages whose files are copied into dist/ by scripts/copy-assets.mjs;
//  - the Electron runtime (desktop only; Chromium's notices ship with it as
//    LICENSES.chromium.html).
// Fails if a shipped package has no identifiable licence.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");
const bundled = JSON.parse(readFileSync(join(root, "build-meta", "bundled-packages.json"), "utf8"));
const COPIED_ASSETS = [
  "pdfjs-dist",
  "tesseract.js",
  "tesseract.js-core",
  "@tesseract.js-data/eng",
  "@tesseract.js-data/fra",
  "@expo-google-fonts/noto-sans",
];
const RUNTIME = ["electron"];

/**
 * Packages without licence metadata, with the evidence used. Reviewed by a
 * human; a new unknown package fails the build until it is added here.
 */
const LICENSE_OVERRIDES = {
  "buffers@0.1.1": {
    license: "MIT/X11 (no licence file; per the author's published projects)",
    note: "Node-only dependency of unzipper (ExcelJS reading .xlsx streams); listed because notices cover the full dependency closure, it is not expected in the browser bundle.",
  },
};

/** Extra licence facts the package metadata does not state. */
const NOTES = {
  "@tesseract.js-data/eng":
    "Packaging: MIT. The model (tessdata 4.0.0 best_int, from github.com/tesseract-ocr/tessdata_best) is licensed under the Apache License 2.0 by the Tesseract OCR authors.",
  "@tesseract.js-data/fra":
    "Packaging: MIT. The model (tessdata 4.0.0 best_int, from github.com/tesseract-ocr/tessdata_best) is licensed under the Apache License 2.0 by the Tesseract OCR authors.",
  "@expo-google-fonts/noto-sans":
    "Only the Noto Sans font files are shipped (fonts/). Font licence: SIL Open Font License 1.1 (see fonts/OFL.txt). Copyright 2022 The Noto Project Authors.",
  "pdfjs-dist":
    "Also ships PDF.js CMaps, standard fonts (FoxitSans/Liberation, see their licence files), ICC profiles and WebAssembly decoders (OpenJPEG, JBIG2, QCMS; licences in pdfjs/wasm/).",
  electron:
    "Desktop runtime only. Chromium and other third-party notices are shipped next to the executable in LICENSES.chromium.html.",
};

function pkgDir(name, from = nm) {
  // Nested node_modules first, then the top level.
  const nested = join(from, "node_modules", name);
  if (from !== nm && existsSync(join(nested, "package.json"))) return nested;
  const top = join(nm, name);
  return existsSync(join(top, "package.json")) ? top : null;
}

function licenceText(dir) {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
  return file ? readFileSync(join(dir, file), "utf8").trim() : null;
}

const seen = new Map();
function add(name, from, reason) {
  const dir = pkgDir(name, from);
  if (!dir) return;
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) return;
  const override = LICENSE_OVERRIDES[key];
  const license =
    override?.license ??
    (typeof pkg.license === "string" ? pkg.license : pkg.license?.type ?? (pkg.licenses ?? []).map((l) => l.type).join(" OR "));
  if (override) NOTES[pkg.name] = override.note;
  seen.set(key, { name: pkg.name, version: pkg.version, license: license || "UNKNOWN", reason, text: licenceText(dir), dir });
  if (reason === "runtime") return; // Electron's own deps are build tooling
  for (const dep of Object.keys(pkg.dependencies ?? {})) add(dep, dir, reason === "bundled" ? "bundled (dependency)" : reason);
}

for (const n of bundled) add(n, nm, "bundled");
for (const n of COPIED_ASSETS) add(n, nm, "shipped assets");
for (const n of RUNTIME) add(n, nm, "runtime");

const entries = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
const unknown = entries.filter((e) => e.license === "UNKNOWN" && !e.text);
if (unknown.length) {
  console.error(`third-party-notices: no licence found for ${unknown.map((e) => e.name).join(", ")}`);
  process.exit(1);
}

const out = [
  "PDF Manager — third-party notices",
  "",
  "PDF Manager is licensed under the Apache License 2.0 (see LICENSE).",
  "It includes the following third-party software and data, each under its own licence.",
  "",
];
for (const e of entries) {
  out.push("=".repeat(78), `${e.name} ${e.version} — ${e.license} (${e.reason})`);
  if (NOTES[e.name]) out.push("", NOTES[e.name]);
  out.push("", e.text ?? `Licence: ${e.license} (no licence file in the package).`, "");
}
const text = `${out.join("\n")}\n`;
mkdirSync(join(root, "build-meta"), { recursive: true });
writeFileSync(join(root, "build-meta", "licenses.json"), `${JSON.stringify(entries.map(({ text: _t, dir: _d, ...e }) => e), null, 2)}\n`);
if (existsSync(join(root, "dist"))) {
  writeFileSync(join(root, "dist", "THIRD-PARTY-NOTICES.txt"), text);
  writeFileSync(join(root, "dist", "LICENSE.txt"), readFileSync(join(root, "LICENSE"), "utf8"));
}

// CycloneDX 1.5 SBOM of exactly the shipped components (the full build
// dependency tree is produced separately in CI with @cyclonedx/cyclonedx-npm).
const app = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const purl = (n, v) => `pkg:npm/${n.startsWith("@") ? `%40${n.slice(1)}` : n}@${v}`;
const spdx = /^[A-Za-z0-9.+-]+$/;
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ vendor: "PDF Manager", name: "scripts/third-party-notices.mjs" }],
    component: {
      type: "application",
      name: app.name,
      version: app.version,
      licenses: [{ license: { id: "Apache-2.0" } }],
      "bom-ref": purl(app.name, app.version),
    },
  },
  components: entries.map((e) => ({
    type: e.name === "electron" ? "framework" : e.reason === "shipped assets" ? "data" : "library",
    name: e.name,
    version: e.version,
    purl: purl(e.name, e.version),
    "bom-ref": purl(e.name, e.version),
    licenses: [spdx.test(e.license) ? { license: { id: e.license } } : { expression: e.license }],
    properties: [{ name: "pdf-manager:inclusion", value: e.reason }],
  })),
};
writeFileSync(join(root, "build-meta", "sbom-shipped.cdx.json"), `${JSON.stringify(sbom, null, 2)}\n`);
console.log(`third-party-notices: ${entries.length} packages (${entries.map((e) => e.license).filter((v, i, a) => a.indexOf(v) === i).join(", ")})`);
