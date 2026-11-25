/// <reference types="vitest/config" />
import { createRequire } from "node:module";
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

// base: './' produces relative asset paths so the same build works inside
// Electron (app://pdf-manager/) and on any static sub-path such as
// GitHub Pages (/pdf_manager/).
export default defineConfig({
  base: "./",
  plugins: [react(), cspMeta()],
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
