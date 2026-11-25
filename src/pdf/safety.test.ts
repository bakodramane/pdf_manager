import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";
import { deriveName, sanitizeStem } from "./filenames";
import { DEFAULT_LIMITS, fitPixels, limitsFor } from "./limits";
import { sniffImage } from "./imageSniff";
import { inspectPdf, hasFindings } from "./inspect";
import { loadPdfFile } from "./loader";

const pdfFile = (bytes: Uint8Array, name = "doc.pdf") =>
  new File([bytes.slice()], name, { type: "application/pdf" });

async function simplePdf(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]).drawText(`p${i + 1}`, { x: 10, y: 10, font });
  return doc.save();
}

describe("safe output file names", () => {
  it("keeps ordinary names readable, including accents", () => {
    expect(deriveName("Rapport annuel é.pdf", "_edited")).toBe("Rapport annuel é_edited.pdf");
    expect(deriveName("archive.tar.gz", "", "pdf")).toBe("archive.tar.pdf");
  });

  it.each([
    ["..\\..\\Windows\\evil.pdf", "evil_x.pdf"],
    ["../../etc/passwd", "passwd_x.pdf"],
    ['a<b>c:d"e|f?g*h.pdf', "a_b_c_d_e_f_g_h_x.pdf"],
    ["invoice\u202Efdp.exe.pdf", "invoicefdp.exe_x.pdf"],
    ["tab\tname\u0000.pdf", "tabname_x.pdf"],
    ["CON.pdf", "CON_x.pdf"],
    [".hidden.pdf", "hidden_x.pdf"],
  ])("cleans %s", (input, expected) => {
    expect(deriveName(input, "_x")).toBe(expected);
  });

  it("handles reserved names, empty names and very long names", () => {
    expect(sanitizeStem("con")).toBe("con_");
    expect(sanitizeStem("LPT1")).toBe("LPT1_");
    expect(sanitizeStem("   ")).toBe("document");
    expect(sanitizeStem("trailing. . .")).toBe("trailing");
    expect(sanitizeStem("x".repeat(500)).length).toBeLessThanOrEqual(120);
    expect(deriveName("doc.pdf", "", "../../exe")).toBe("doc.exe");
  });
});

describe("resource limits", () => {
  it("uses conservative defaults and shrinks on low-memory devices", () => {
    expect(limitsFor(undefined)).toEqual(DEFAULT_LIMITS);
    expect(limitsFor(4)).toEqual(DEFAULT_LIMITS);
    expect(limitsFor(8).maxTotalBytes).toBeGreaterThan(DEFAULT_LIMITS.maxTotalBytes);
    const low = limitsFor(2);
    expect(low.maxTotalBytes).toBeLessThan(DEFAULT_LIMITS.maxTotalBytes);
    expect(low.maxRenderPixels).toBeLessThan(DEFAULT_LIMITS.maxRenderPixels);
  });

  it("scales rasters to fit a pixel budget", () => {
    expect(fitPixels(1000, 1000, 2_000_000)).toBe(1);
    const k = fitPixels(10_000, 10_000, 16_000_000);
    expect(10_000 * k * 10_000 * k).toBeCloseTo(16_000_000, -3);
  });
});

describe("image sniffing", () => {
  it("identifies PNG and reads its dimensions", () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    png.set([0, 0, 0x4e, 0x20, 0, 0, 0x4e, 0x20], 16); // 20000 x 20000
    expect(sniffImage(png)).toEqual({ type: "png", width: 20000, height: 20000 });
  });

  it("identifies JPEG with EXIF and finds the frame size", () => {
    const exif = [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
    const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0x90, 0x03];
    const jpg = new Uint8Array([0xff, 0xd8, ...exif, ...sof, ...new Array(20).fill(0)]);
    expect(sniffImage(jpg)).toEqual({ type: "jpeg", width: 400, height: 300, exif: true });
  });

  it("rejects non-images and disguised files", () => {
    expect(sniffImage(new TextEncoder().encode("%PDF-1.7 not an image"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("MZ\u0090\u0000 windows exe"))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
  });
});

describe("PDF findings", () => {
  it("finds nothing in a plain PDF", async () => {
    const doc = await PDFDocument.load(await simplePdf());
    expect(hasFindings(inspectPdf(doc))).toBe(false);
  });

  it("detects JavaScript, launch actions, attachments and signatures", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const ctx = doc.context;
    doc.catalog.set(
      PDFName.of("OpenAction"),
      ctx.register(ctx.obj({ S: "JavaScript", JS: PDFString.of("app.alert(1)") })),
    );
    ctx.register(ctx.obj({ S: "Launch", F: PDFString.of("calc.exe") }));
    await doc.attach(new Uint8Array([1, 2, 3]), "note.txt", { mimeType: "text/plain" });
    ctx.register(ctx.obj({ FT: "Sig", T: PDFString.of("Sig1"), V: ctx.obj({ Type: "Sig", ByteRange: [0, 1, 2, 3] }) }));
    const reloaded = await PDFDocument.load(await doc.save());
    expect(inspectPdf(reloaded)).toEqual({
      signed: true,
      javascript: true,
      externalActions: true,
      attachments: true,
      xfa: false,
    });
  });
});

describe("loading budgets", () => {
  it("rejects a file that would exceed the total memory budget", async () => {
    const bytes = await simplePdf();
    const limits = { ...DEFAULT_LIMITS, maxTotalBytes: bytes.length + 10 };
    await expect(loadPdfFile(pdfFile(bytes), { loadedBytes: 100, loadedPages: 0 }, limits)).rejects.toMatchObject({
      code: "totalTooLarge",
    });
  });

  it("rejects a file that would exceed the total page budget", async () => {
    const limits = { ...DEFAULT_LIMITS, maxTotalPages: 4 };
    await expect(
      loadPdfFile(pdfFile(await simplePdf(3)), { loadedBytes: 0, loadedPages: 2 }, limits),
    ).rejects.toMatchObject({ code: "tooManyPages" });
  });

  it("attaches findings to the loaded source", async () => {
    const { source } = await loadPdfFile(pdfFile(await simplePdf(2)));
    expect(source.findings?.signed).toBe(false);
    expect(source.pageCount).toBe(2);
  });

  it("refuses encrypted PDFs honestly", async () => {
    const enc = new TextEncoder().encode(
      "%PDF-1.7\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n" +
        "3 0 obj<</Filter/Standard/V 2/R 3/O(x)/U(y)/P -4>>endobj\ntrailer<</Root 1 0 R/Encrypt 3 0 R>>\n%%EOF",
    );
    await expect(loadPdfFile(pdfFile(enc, "locked.pdf"))).rejects.toMatchObject({ code: "encrypted" });
  });
});
