/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: './' produces relative asset paths so the built index.html works
// when loaded from a file:// URL inside Electron (dist/index.html).
// It also keeps the browser dev workflow working via the Vite dev server.
export default defineConfig({
  base: "./",
  plugins: [react()],
  worker: {
    format: "es",
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
