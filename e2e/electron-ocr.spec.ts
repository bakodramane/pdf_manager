import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { requirePopplerExecutable, runPdftotext } from "../src/test/poppler";
import { writeScannedPdf } from "./fixtures";

// Offline OCR in the real desktop shell: bundled engine + models only, every
// request logged and checked, searchable PDF validated with both PDF.js and
// Poppler's pdftotext (independent C++ parser).

const require = createRequire(import.meta.url);
const STD_FONTS = pathToFileURL(join(require.resolve("pdfjs-dist/package.json"), "..", "standard_fonts") + "/").href;

const LINES = [
  "Le cœur de l'été à Montréal était très agréable.",
  "The quick brown fox jumps over the lazy dog.",
  "Facture numéro 2048, échéance le 15 mars 2026.",
];

async function extractWithPdfjs(filePath: string): Promise<{ numPages: number; text: string }> {
  const bytes = new Uint8Array(readFileSync(filePath));
  const task = getDocument({ data: bytes, standardFontDataUrl: STD_FONTS });
  try {
    const doc = await task.promise;
    const chunks: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      chunks.push(content.items.map((it) => ("str" in it ? it.str : "")).join(""));
    }
    return { numPages: doc.numPages, text: chunks.join("\n") };
  } finally {
    await task.destroy();
  }
}

let app: ElectronApplication;
let page: Page;
let pdftotextBin: string;
const saveDir = mkdtempSync(join(tmpdir(), "pdfm-e2e-save-"));

test.beforeAll(async () => {
  // Fail fast with actionable cross-platform installation instructions before
  // launching Electron or running OCR if Poppler is missing or misconfigured.
  pdftotextBin = requirePopplerExecutable("pdftotext");

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
  const beforeOcr = await extractWithPdfjs(file);
  expect(beforeOcr.numPages).toBe(1);
  expect(beforeOcr.text.trim()).toBe("");

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

  // Cross-platform PDF.js validation of the saved searchable PDF.
  const viaPdfjs = await extractWithPdfjs(saved);
  expect(viaPdfjs.numPages).toBe(1);
  expect(viaPdfjs.text).toContain("Montréal");
  expect(viaPdfjs.text).toContain("quick brown fox");
  expect(viaPdfjs.text).toContain("échéance");

  // Independent Poppler validation (never skipped or weakened).
  const extracted = runPdftotext(["-enc", "UTF-8", saved, "-"], pdftotextBin);
  expect(extracted).toContain("Montréal");
  expect(extracted).toContain("quick brown fox");
  expect(extracted).toContain("échéance");

  const requests = await app.evaluate(() => (globalThis as unknown as { __requests: string[] }).__requests);
  const external = requests.filter((u) => !/^(app:|blob:|data:|ERR (app|blob|data):)/.test(u));
  expect(external).toEqual([]);
  expect(requests.some((u) => u.includes("/ocr/lang/fra.traineddata.gz"))).toBe(true);
});
