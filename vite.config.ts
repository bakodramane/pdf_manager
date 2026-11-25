/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

// base: './' produces relative asset paths so the built index.html works
// when loaded from a file:// URL inside Electron (dist/index.html).
// It also keeps the browser dev workflow working via the Vite dev server.
export default defineConfig({
  base: "./",
  plugins: [react()],
  // App version shown in the Credits dialog (single source: package.json).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
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
