import { defineConfig } from "@playwright/test";

// Chromium on Linux decodes file paths with the locale's encoding; CI
// containers often have none, which breaks fixture paths with accents.
process.env.LANG ||= "C.UTF-8";
process.env.LC_ALL ||= "C.UTF-8";

// End-to-end tests. Both projects run against the production build in dist/
// (run `npm run build` first):
// - electron: launches the real Electron shell (PDF_MANAGER_USE_DIST=1) and
//   checks the security boundary plus core workflows.
// - web: serves dist/ under the GitHub Pages sub-path /pdf_manager/ and
//   checks the browser edition.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { trace: "off" },
  projects: [
    { name: "electron", testMatch: /electron(-[a-z]+)?\.spec\.ts/ },
    {
      name: "web",
      testMatch: /web\.spec\.ts/,
      use: { browserName: "chromium", baseURL: "http://127.0.0.1:4173/pdf_manager/" },
    },
  ],
  webServer: {
    command: "node scripts/serve-dist.mjs 4173 /pdf_manager/",
    url: "http://127.0.0.1:4173/pdf_manager/",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
