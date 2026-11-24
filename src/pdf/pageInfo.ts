import type { PDFPageProxy } from "pdfjs-dist";
import { getRenderDoc } from "./render";
import type { FieldValue, PdfSource } from "./types";
import { OFF } from "./forms";

/** A page's visible box (PDF user space) and its own /Rotate. */
export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
}

const key = (sourceId: string, pageIndex: number) => `${sourceId}:${pageIndex}`;
const boxes = new Map<string, PageBox>();
const widgets = new Map<string, Promise<FormWidget[]>>();

export function loadPage(source: PdfSource, pageIndex: number): Promise<PDFPageProxy> {
  return getRenderDoc(source.id, source.bytes).then((doc) => doc.getPage(pageIndex + 1));
}

export function cachedPageBox(sourceId: string, pageIndex: number): PageBox | undefined {
  return boxes.get(key(sourceId, pageIndex));
}

export async function getPageBox(source: PdfSource, pageIndex: number): Promise<PageBox> {
  const cached = cachedPageBox(source.id, pageIndex);
  if (cached) return cached;
  const page = await loadPage(source, pageIndex);
  const [x0, y0, x1, y1] = page.view;
  const box = { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rotate: page.rotate };
  boxes.set(key(source.id, pageIndex), box);
  return box;
}

/** A fillable form widget on a page, in a shape the viewer can draw. */
export interface FormWidget {
  id: string;
  /** Fully qualified field name (shared by all widgets of one field). */
  name: string;
  /** [x1, y1, x2, y2] in PDF user space. */
  rect: [number, number, number, number];
  type: "text" | "checkbox" | "radio" | "choice";
  readOnly: boolean;
  multiline: boolean;
  maxLen: number | null;
  /** Value that means "checked" for this check box / radio button. */
  onValue: string;
  /** Value stored in the file. */
  initial: FieldValue;
  /** Choice options; values are the display texts. */
  options: string[];
  /** Drop-down (true) or list box (false). */
  combo: boolean;
  /** Font size in points (0 = fit to the box). */
  fontSize: number;
  align: "left" | "center" | "right";
}

/* PDF.js annotation data is untyped; read it defensively. */
type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

function toWidget(d: Raw): FormWidget | null {
  if (d.subtype !== "Widget" || d.hidden || d.pushButton) return null;
  const name = str(d.fieldName);
  const rect = d.rect as FormWidget["rect"] | undefined;
  if (!name || !rect) return null;
  const options = Array.isArray(d.options)
    ? (d.options as Raw[]).map((o) => str(o.displayValue) || str(o.exportValue))
    : [];
  const exportValues = Array.isArray(d.options)
    ? (d.options as Raw[]).map((o) => str(o.exportValue))
    : [];
  let type: FormWidget["type"];
  let initial: string;
  if (d.fieldType === "Tx") {
    type = "text";
    initial = str(d.fieldValue);
  } else if (d.fieldType === "Btn" && (d.checkBox || d.radioButton)) {
    type = d.checkBox ? "checkbox" : "radio";
    initial = str(d.fieldValue) || OFF;
  } else if (d.fieldType === "Ch") {
    type = "choice";
    const raw = Array.isArray(d.fieldValue) ? str(d.fieldValue[0]) : str(d.fieldValue);
    const i = exportValues.indexOf(raw);
    initial = i >= 0 ? options[i] : raw;
  } else {
    return null;
  }
  const da = d.defaultAppearanceData as Raw | undefined;
  const align = (["left", "center", "right"] as const)[Number(d.textAlignment) || 0] ?? "left";
  return {
    id: str(d.id) || `${name}:${rect.join(",")}`,
    name,
    rect,
    type,
    readOnly: Boolean(d.readOnly),
    multiline: Boolean(d.multiLine),
    maxLen: typeof d.maxLen === "number" && d.maxLen > 0 ? d.maxLen : null,
    onValue: str(d.checkBox ? d.exportValue : d.buttonValue) || "Yes",
    initial,
    options,
    combo: Boolean(d.combo),
    fontSize: typeof da?.fontSize === "number" ? da.fontSize : 0,
    align,
  };
}

/** The fillable form widgets on a page (cached per source page). */
export function getFormWidgets(source: PdfSource, pageIndex: number): Promise<FormWidget[]> {
  const k = key(source.id, pageIndex);
  let found = widgets.get(k);
  if (!found) {
    found = loadPage(source, pageIndex)
      .then((page) => page.getAnnotations({ intent: "display" }))
      .then((list) => (list as Raw[]).map(toWidget).filter((w): w is FormWidget => w !== null))
      .catch(() => []);
    widgets.set(k, found);
  }
  return found;
}

/** Forget cached data for a source that is no longer loaded. */
export function dropPageInfo(sourceId: string): void {
  for (const map of [boxes, widgets]) {
    for (const k of [...map.keys()]) if (k.startsWith(`${sourceId}:`)) map.delete(k);
  }
}
