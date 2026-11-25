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
