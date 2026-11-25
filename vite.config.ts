/// <reference types="vitest/config" />
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

const require = createRequire(import.meta.url);
// Single source of truth for the Content Security Policy (also sent as a
// response header by the Electron app:// protocol handler).
const { CSP } = require("./electron/security.cjs") as { CSP: string };

/**
 * Production builds get the CSP as a <meta> tag too, so the static web
 * edition is protected where the host cannot set headers (GitHub Pages).
 * `frame-ancestors` is ignored in <meta> by browsers, so it is dropped here
 * rather than giving a false impression; see docs/security/threat-model.md.
 * The dev server is left without a CSP (Vite injects inline HMR code).
 */
function cspMeta(): Plugin {
  const metaCsp = CSP.split("; ")
    .filter((d) => !d.startsWith("frame-ancestors"))
    .join("; ");
  return {
    name: "pdf-manager-csp-meta",
    apply: "build",
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        // (charset first, then the policy)
        html.replace('<meta charset="UTF-8" />', "").replace(
          "<head>",
          `<head>\n    <meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${metaCsp}" />`,
        ),
    },
  };
}

/**
 * Web edition: write dist/sw.js from scripts/sw-template.js with the exact
 * list of application files to precache and a version derived from their
 * content (any change gives a new version, so app and worker never mix).
 * OCR engine/models and the Unicode fonts are not precached (OCR is cached
 * only on explicit request; fonts on first use).
 */
function serviceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "pdf-manager-service-worker",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    writeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).split(sep).join("/"));
        }
      };
      walk(outDir);
      const precache = files
        .filter(
          (f) =>
            (f === "ocr/manifest.json" || !/^(ocr|fonts|pdfjs\/cmaps)\//.test(f)) && f !== "sw.js" && !f.endsWith(".map"),
        )
        .sort();
      const hash = createHash("sha256");
      for (const f of precache) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest("hex").slice(0, 16);
      const ocrManifest = join(outDir, "ocr", "manifest.json");
      const ocrVersion = createHash("sha256").update(readFileSync(ocrManifest)).digest("hex").slice(0, 12);
      const sw = readFileSync("scripts/sw-template.js", "utf8")
        .replaceAll("__VERSION__", version)
        .replaceAll("__OCR_VERSION__", ocrVersion)
        .replaceAll("__PRECACHE__", JSON.stringify(precache));
      if (/__(VERSION|OCR_VERSION|PRECACHE)__/.test(sw)) throw new Error("sw.js: unfilled placeholder");
      writeFileSync(join(outDir, "sw.js"), sw);
    },
  };
}

/**
 * Record which npm packages are actually bundled into the renderer and its
 * workers (written to build-meta/, outside dist/ so it never ships). Used by
 * scripts/third-party-notices.mjs; package.json's dependency sections are
 * not a reliable guide to what is shipped.
 */
function bundledPackages(): Plugin {
  const found = new Set<string>();
  return {
    name: "pdf-manager-bundled-packages",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        for (const id of chunk.moduleIds) {
          const m = id.replace(/\\/g, "/").match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//g);
          if (!m) continue;
          // The innermost node_modules segment is the package that owns the file.
          const last = m[m.length - 1].replace(/^node_modules\//, "").replace(/\/$/, "");
          found.add(last);
        }
      }
    },
    closeBundle() {
      mkdirSync("build-meta", { recursive: true });
      writeFileSync("build-meta/bundled-packages.json", `${JSON.stringify([...found].sort(), null, 2)}\n`);
    },
  };
}

// base: './' produces relative asset paths so the same build works inside
// Electron (app://pdf-manager/) and on any static sub-path such as
// GitHub Pages (/pdf_manager/).
export default defineConfig({
  base: "./",
  plugins: [react(), cspMeta(), serviceWorker(), bundledPackages()],
  // App version shown in the Credits dialog (single source: package.json).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // Never publish source maps.
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  worker: {
    format: "es",
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts", "electron/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    testTimeout: 30000,
    // PDF.js 5+ ships two builds: the modern one (used by the app, which runs
    // in Electron's Chromium and current browsers) relies on recent APIs such
    // as Uint8Array#toHex that Node 22 lacks. Unit tests run in Node, so they
    // use the official "legacy" build of the same version.
    alias: [{ find: /^pdfjs-dist$/, replacement: "pdfjs-dist/legacy/build/pdf.mjs" }],
  },
});
