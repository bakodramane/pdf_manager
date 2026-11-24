import {
  PDFArray,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFObjectCopier,
  PDFOptionList,
  PDFRadioGroup,
  PDFRef,
  PDFTextField,
  StandardFonts,
  type PDFFont,
} from "pdf-lib";
import type { FieldValue } from "./types";

/** Value meaning "not checked" for check boxes and radio buttons. */
export const OFF = "Off";

/**
 * Write the user's form values into a loaded document's fields and refresh
 * the fields' appearances, so the values show in any viewer. Fields that
 * cannot be found or set are skipped. Returns the names that were applied.
 */
export async function applyFormValues(
  doc: PDFDocument,
  values: Record<string, FieldValue>,
): Promise<string[]> {
  const names = Object.keys(values);
  if (names.length === 0) return [];
  const form = doc.getForm();
  let font: PDFFont | null = null;
  const applied: string[] = [];

  for (const name of names) {
    const value = values[name];
    const field = form.getFieldMaybe(name);
    if (!field) continue;
    try {
      if (field instanceof PDFTextField) {
        field.setText(value || undefined);
      } else if (field instanceof PDFCheckBox) {
        if (value && value !== OFF) field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup) {
        if (!value || value === OFF) field.clear();
        else if (field.getOptions().includes(value)) field.select(value);
        else {
          // The viewer reports the button's "on" state name, which differs
          // from its export value when the field has an /Opt list.
          const on = field.acroField.getOnValues().find((v) => v.decodeText() === value);
          if (!on) continue;
          field.acroField.setValue(on);
        }
      } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        if (value) field.select(value);
        else field.clear();
      } else {
        continue;
      }
    } catch {
      continue; // e.g. a value the field does not accept
    }
    // Check boxes and radio buttons keep their own appearances; text and
    // choice fields need theirs redrawn with the new value.
    if (
      field instanceof PDFTextField ||
      field instanceof PDFDropdown ||
      field instanceof PDFOptionList
    ) {
      try {
        font ??= await doc.embedFont(StandardFonts.Helvetica);
        field.updateAppearances(font);
      } catch {
        // Characters Helvetica cannot draw: viewers rebuild the appearance
        // (NeedAppearances is set on the output form).
      }
    }
    applied.push(name);
  }
  return applied;
}

/**
 * Copying pages into a new document carries their form widgets but not the
 * document-level form that lists the fields, so viewers would no longer
 * treat them as fillable. Rebuild that list from the widgets on the output
 * pages, taking the default appearance and resources from the sources.
 */
export function rebuildAcroForm(out: PDFDocument, sources: PDFDocument[]): void {
  const context = out.context;
  const roots: PDFRef[] = [];
  const seen = new Set<string>();

  for (const page of out.getPages()) {
    const annots = page.node.Annots();
    if (!(annots instanceof PDFArray)) continue;
    for (let i = 0; i < annots.size(); i++) {
      const item = annots.get(i);
      if (!(item instanceof PDFRef)) continue;
      let ref: PDFRef = item;
      let dict = context.lookupMaybe(ref, PDFDict);
      if (dict?.get(PDFName.of("Subtype")) !== PDFName.of("Widget")) continue;
      // Walk up to the top-level field.
      for (let guard = 0; dict && guard < 32; guard++) {
        const parent = dict.get(PDFName.of("Parent"));
        if (!(parent instanceof PDFRef)) break;
        ref = parent;
        dict = context.lookupMaybe(parent, PDFDict);
      }
      if (!seen.has(ref.toString())) {
        seen.add(ref.toString());
        roots.push(ref);
      }
    }
  }
  if (roots.length === 0) return;

  const acroForm = context.obj({ Fields: roots, NeedAppearances: true });
  const source = sources.find((d) => d.catalog.get(PDFName.of("AcroForm")));
  const srcForm = source && source.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  if (source && srcForm) {
    const copier = PDFObjectCopier.for(source.context, context);
    for (const key of ["DA", "DR", "Q"]) {
      const value = srcForm.get(PDFName.of(key));
      if (value) acroForm.set(PDFName.of(key), copier.copy(value));
    }
  }
  out.catalog.set(PDFName.of("AcroForm"), context.register(acroForm));
}
