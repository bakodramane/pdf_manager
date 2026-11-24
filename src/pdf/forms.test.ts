import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { assemblePdf } from "./assemble";
import type { PageRef, PdfSource } from "./types";

async function formSource(): Promise<PdfSource> {
  const doc = await PDFDocument.create();
  const p1 = doc.addPage([400, 400]);
  const p2 = doc.addPage([400, 400]);
  const form = doc.getForm();
  form.createTextField("name").addToPage(p1, { x: 20, y: 300, width: 200, height: 24 });
  form.createCheckBox("agree").addToPage(p1, { x: 20, y: 250, width: 16, height: 16 });
  const radio = form.createRadioGroup("size");
  radio.addOptionToPage("S", p2, { x: 20, y: 300, width: 16, height: 16 });
  radio.addOptionToPage("L", p2, { x: 60, y: 300, width: 16, height: 16 });
  const dd = form.createDropdown("colour");
  dd.addOptions(["Red", "Blue"]);
  dd.addToPage(p2, { x: 20, y: 200, width: 120, height: 24 });
  const bytes = await doc.save();
  return { id: "f", name: "form.pdf", bytes, pageCount: 2 };
}

const pagesOf = (n: number): PageRef[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, sourceId: "f", pageIndex: i, rotation: 0 }));

describe("form filling", () => {
  it("writes values and keeps the fields fillable", async () => {
    const src = await formSource();
    const out = await assemblePdf(pagesOf(2), () => src, {
      f: { name: "Ada Lovelace", agree: "Yes", size: "L", colour: "Blue" },
    });
    const form = (await PDFDocument.load(out)).getForm();
    expect(form.getTextField("name").getText()).toBe("Ada Lovelace");
    expect(form.getCheckBox("agree").isChecked()).toBe(true);
    expect(form.getRadioGroup("size").getSelected()).toBe("L");
    expect(form.getDropdown("colour").getSelected()).toEqual(["Blue"]);
  });

  it("accepts a radio button's on-state name as well as its export value", async () => {
    const src = await formSource();
    // pdf-lib names the states "0", "1", … and lists "S", "L" as export values.
    const out = await assemblePdf(pagesOf(2), () => src, { f: { size: "1" } });
    const form = (await PDFDocument.load(out)).getForm();
    expect(form.getRadioGroup("size").getSelected()).toBe("L");
  });

  it("keeps only the fields of the exported pages", async () => {
    const src = await formSource();
    const out = await assemblePdf([pagesOf(2)[1]], () => src);
    const names = (await PDFDocument.load(out))
      .getForm()
      .getFields()
      .map((f) => f.getName())
      .sort();
    expect(names).toEqual(["colour", "size"]);
  });

  it("ignores unknown fields and bad values", async () => {
    const src = await formSource();
    const out = await assemblePdf(pagesOf(2), () => src, {
      f: { missing: "x", colour: "Green", name: "ok" },
    });
    const form = (await PDFDocument.load(out)).getForm();
    expect(form.getTextField("name").getText()).toBe("ok");
  });
});
