import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { writeSamplePdf, writeScannedPdf } from "./fixtures";

// Web edition served from dist/ under /pdf_manager/ (the GitHub Pages
// sub-path) with the production CSP <meta>. Every request is recorded: the
// app must only ever talk to its own origin.

const requests: string[] = [];
const csp: string[] = [];

async function open(page: Page) {
  page.on("request", (r) => requests.push(r.url()));
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) csp.push(m.text());
  });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "PDF Manager" })).toBeVisible();
}

async function load(page: Page, file: string) {
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles(file);
}

async function download(page: Page, click: () => Promise<void>) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), click()]);
  return { name: dl.suggestedFilename(), bytes: readFileSync((await dl.path())!) };
}

test.afterAll(() => {
  const foreign = requests.filter((u) => !u.startsWith("http://127.0.0.1:4173/pdf_manager/") && !/^(blob|data):/.test(u));
  expect(foreign, "requests outside the app origin").toEqual([]);
  expect(csp, "CSP violations").toEqual([]);
});

test("page tools: blank page, duplicate, numbers, watermark, images", async ({ page }) => {
  await open(page);
  await load(page, await writeSamplePdf(2));
  await expect(page.getByText(/^2 pages$/).first()).toBeVisible();

  await page.getByRole("button", { name: "Page tools" }).click();
  await page.getByRole("button", { name: "Insert a blank page" }).click();
  await expect(page.getByText(/^3 pages$/).first()).toBeVisible();

  await page.getByLabel("Text", { exact: true }).first().fill("Page {n} of {total}");
  await page.getByRole("button", { name: "Add page numbers" }).click();
  await expect(page.getByText("Page numbers added.")).toBeVisible();

  await page.getByPlaceholder("e.g. DRAFT, CONFIDENTIAL").fill("BROUILLON");
  await page.getByRole("button", { name: "Add watermark" }).click();
  await expect(page.getByText("Watermark added.")).toBeVisible();

  const zip = await download(page, () => page.getByRole("button", { name: "Save as images" }).click());
  expect(zip.name).toMatch(/_images\.zip$/);
  const entries = Object.keys((await JSZip.loadAsync(zip.bytes)).files);
  expect(entries).toHaveLength(3);
  expect(entries[0]).toMatch(/_p1\.png$/);

  await page.getByRole("button", { name: "Export" }).first().click();
  const pdf = await download(page, () => page.getByRole("button", { name: "Download edited PDF" }).click());
  const doc = await PDFDocument.load(pdf.bytes);
  expect(doc.getPageCount()).toBe(3);
});

test("compression (balanced) shrinks a scanned document in the browser", async ({ page }) => {
  await open(page);
  await load(page, await writeScannedPdf(["Compression test page with a large scanned image."]));
  await page.getByRole("button", { name: "Compress" }).first().click();
  await page.getByLabel(/Balanced/).check();
  await page.getByRole("button", { name: "Compress document" }).click();
  await expect(page.getByText(/% smaller|No reduction/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/% smaller/)).toBeVisible();
});

test("Word and Excel exports open as valid Office files", async ({ page }) => {
  await open(page);
  await load(page, await writeSamplePdf(1));
  await page.getByRole("button", { name: "Convert" }).first().click();
  const docx = await download(page, () => page.getByRole("button", { name: /Word/ }).first().click());
  const docXml = await (await JSZip.loadAsync(docx.bytes)).file("word/document.xml")!.async("string");
  expect(docXml).toContain("Sample page 1");
  const xlsx = await download(page, () => page.getByRole("button", { name: /Excel/ }).first().click());
  expect(Object.keys((await JSZip.loadAsync(xlsx.bytes)).files)).toContain("xl/workbook.xml");
});

test("OCR runs in the browser with same-origin models only", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  await load(page, await writeScannedPdf(["Le cœur de l'été à Montréal était très agréable."]));
  await page.getByRole("button", { name: "Recognise text" }).first().click();
  await page.getByLabel("Language of the document").selectOption("fra");
  await page.getByRole("button", { name: "Recognise text", exact: true }).last().click();
  await expect(page.getByText(/Text recognised on 1 page/)).toBeVisible({ timeout: 180_000 });
  await page.getByText(/^Page 1 ·/).click();
  expect(await page.getByLabel("Recognised text of page 1").inputValue()).toContain("Montréal");
  expect(requests.some((u) => u.endsWith("/pdf_manager/ocr/lang/fra.traineddata.gz"))).toBe(true);
});
