import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** A small synthetic multi-page PDF written to a temp folder with spaces and accents. */
export async function writeSamplePdf(pages = 3, name = "échantillon test.pdf"): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Sample page ${i + 1}`, { x: 72, y: 760, size: 24, font, color: rgb(0, 0, 0) });
    page.drawText("Synthetic test document - no real data.", { x: 72, y: 720, size: 12, font });
  }
  const dir = mkdtempSync(join(tmpdir(), "pdf manager e2e é-"));
  const file = join(dir, name);
  writeFileSync(file, await doc.save());
  return file;
}

/**
 * A synthetic "scanned" PDF: text drawn into a bitmap (no text layer), then
 * embedded as a full-page image, like a scanner's output.
 */
export async function writeScannedPdf(lines: string[], name = "scan test é.pdf"): Promise<string> {
  const { createCanvas, GlobalFonts } = await import("@napi-rs/canvas");
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  GlobalFonts.registerFromPath(
    require.resolve("@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf"),
    "Noto Sans Test",
  );
  const scale = 200 / 72;
  const canvas = createCanvas(Math.round(595 * scale), Math.round(842 * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111";
  ctx.font = `${Math.round(16 * scale)}px "Noto Sans Test"`;
  lines.forEach((line, i) => ctx.fillText(line, 60 * scale, (82 + i * 36) * scale));
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(canvas.toBuffer("image/png"));
  doc.addPage([595, 842]).drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
  const dir = mkdtempSync(join(tmpdir(), "pdf manager scan é-"));
  const file = join(dir, name);
  writeFileSync(file, await doc.save());
  return file;
}
