import { test as base, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSamplePdf, writeScannedPdf } from "./fixtures";

// Offline behaviour of the web edition (service worker), at the GitHub
// Pages sub-path. Uses a persistent (on-disk) browser profile, as a real
// user's browser has, so the service worker and Cache Storage behave as in
// normal browsing.
const test = base.extend<{ context: BrowserContext; page: Page }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "pdfm-pwa-profile-")), {
      baseURL: "http://127.0.0.1:4173/pdf_manager/",
    });
    await use(ctx);
    await ctx.close();
  },
  page: async ({ context }, use) => {
    await use(context.pages()[0] ?? (await context.newPage()));
  },
});

test("works offline after the first visit; OCR packs only on request; no documents cached", async ({ page, context }) => {
  test.setTimeout(300_000);
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "PDF Manager" })).toBeVisible();
  // Wait for the worker to install and take control, then reload once.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await page.getByRole("button", { name: "Offline use" }).click();
  await expect(page.getByText("The application is ready to work offline.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/not downloaded/).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Fully offline: the app shell, PDF.js and rendering still work.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "PDF Manager" })).toBeVisible();
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles(await writeSamplePdf(2));
  await expect(page.getByText(/^2 pages$/).first()).toBeVisible();
  await expect(page.locator("img[src^='data:image/png']").first()).toBeVisible({ timeout: 30_000 });

  // OCR without a prepared pack fails with a message, not a crash.
  await page.getByRole("button", { name: "Close document" }).click();
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles(
    await writeScannedPdf(["Offline without a language pack."]),
  );
  await page.getByRole("button", { name: "Recognise text" }).first().click();
  await page.getByRole("button", { name: "Recognise text", exact: true }).last().click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 60_000 });

  // Back online: prepare the French pack explicitly, then go offline again.
  await context.setOffline(false);
  await page.getByRole("button", { name: "Offline use" }).click();
  await page.getByRole("button", { name: "Make available offline" }).nth(1).click(); // French
  await expect(page.getByText(/^French \(.*\) — available offline$/)).toBeVisible({ timeout: 120_000 });
  await page.keyboard.press("Escape");
  await context.setOffline(true);

  await page.getByRole("button", { name: "Close document" }).click();
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles(
    await writeScannedPdf(["Le cœur de l'été à Montréal était très agréable."]),
  );
  await page.getByLabel("Language of the document").selectOption("fra");
  await page.getByRole("button", { name: "Recognise text", exact: true }).last().click();
  await expect(page.getByText("1 page(s) recognised, 0 skipped (already text), 0 failed.")).toBeVisible({
    timeout: 180_000,
  });
  await page.getByText(/^Page 1 ·/).click();
  expect(await page.getByLabel("Recognised text of page 1").inputValue()).toContain("Montréal");

  // Cache Storage holds application files only.
  const cached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) out.push(req.url);
    }
    return out;
  });
  expect(cached.length).toBeGreaterThan(10);
  for (const url of cached) {
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:4173\/pdf_manager\//);
    expect(url).not.toMatch(/\.pdf($|\?)|blob:|data:|échantillon|scan/);
  }
  expect(cached.some((u) => u.endsWith("ocr/lang/fra.traineddata.gz"))).toBe(true);
  expect(cached.some((u) => u.endsWith("ocr/lang/eng.traineddata.gz"))).toBe(false);
  await context.setOffline(false);
});
