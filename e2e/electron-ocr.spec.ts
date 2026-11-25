import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeScannedPdf } from "./fixtures";

// Offline OCR in the real desktop shell: bundled engine + models only, every
// request logged and checked, searchable PDF validated with Poppler.

const LINES = [
  "Le cœur de l'été à Montréal était très agréable.",
  "The quick brown fox jumps over the lazy dog.",
  "Facture numéro 2048, échéance le 15 mars 2026.",
];

let app: ElectronApplication;
let page: Page;
const saveDir = mkdtempSync(join(tmpdir(), "pdfm-e2e-save-"));

test.beforeAll(async () => {
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  app = await electron.launch({
    args: [...(isRoot || process.env.E2E_NO_SANDBOX === "1" ? ["--no-sandbox"] : []), "."],
    env: { ...process.env, PDF_MANAGER_USE_DIST: "1", LANG: process.env.LANG || "C.UTF-8", LC_ALL: process.env.LC_ALL || "C.UTF-8" },
  });
  page = await app.firstWindow();
  // Test-only hooks in the main process: log every request that completes or
  // fails, and save downloads to a temp folder instead of showing a dialog.
  await app.evaluate(({ session }, dir) => {
    const g = globalThis as unknown as { __requests: string[] };
    g.__requests = [];
    const ses = session.defaultSession;
    ses.webRequest.onCompleted((d) => g.__requests.push(d.url));
    ses.webRequest.onErrorOccurred((d) => g.__requests.push(`ERR ${d.url}`));
    ses.on("will-download", (_e, item) => item.setSavePath(`${dir}/${item.getFilename()}`));
  }, saveDir);
  await expect(page.getByRole("heading", { name: "PDF Manager" })).toBeVisible();
});

test.afterAll(async () => {
  await app?.close();
});

test("recognises a scanned PDF offline and saves a searchable copy", async () => {
  test.setTimeout(240_000);
  const file = await writeScannedPdf(LINES);
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles(file);
  await expect(page.getByText(/^1 page$/).first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Recognise text" }).first().click();
  await page.getByLabel("Language of the document").selectOption("eng+fra");
  await page.getByRole("button", { name: "Recognise text", exact: true }).last().click();

  await expect(page.getByText(/Text recognised on 1 page/)).toBeVisible({ timeout: 180_000 });
  await page.getByText(/^Page 1 ·/).click();
  const text = await page.getByLabel("Recognised text of page 1").inputValue();
  expect(text).toContain("Montréal");
  expect(text).toContain("quick brown fox");
  expect(text).toContain("échéance");

  await page.getByRole("button", { name: "Save searchable PDF" }).click();
  await expect(page.getByText(/Saved .*_ocr\.pdf/)).toBeVisible({ timeout: 60_000 });
  const saved = join(saveDir, "scan test é_ocr.pdf");
  await expect.poll(() => {
    try {
      return readFileSync(saved).length;
    } catch {
      return 0;
    }
  }, { timeout: 30_000 }).toBeGreaterThan(1000);
  const extracted = execFileSync("pdftotext", ["-enc", "UTF-8", saved, "-"]).toString("utf8");
  expect(extracted).toContain("Montréal");
  expect(extracted).toContain("échéance");

  const requests = await app.evaluate(() => (globalThis as unknown as { __requests: string[] }).__requests);
  const external = requests.filter((u) => !/^(app:|blob:|data:|ERR (app|blob|data):)/.test(u));
  expect(external).toEqual([]);
  expect(requests.some((u) => u.includes("/ocr/lang/fra.traineddata.gz"))).toBe(true);
});
