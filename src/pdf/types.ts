/**
 * Core data model for the editor.
 *
 * The editor works on a flat ordered list of "page references". Each page
 * reference points back to a loaded source PDF and a page index within it.
 * This makes reorder / delete / insert / merge trivial array operations and
 * keeps the heavy PDF bytes loaded only once per source file.
 *
 * Annotations (text and images such as signatures) live on the page
 * reference and stay editable until the document is assembled, when they are
 * drawn into the page. Form field values are kept per source file and are
 * written into the fields on assembly too.
 */

export interface PdfSource {
  /** Stable id for this loaded file. */
  id: string;
  /** Original file name (used for export naming and the UI). */
  name: string;
  /** Raw PDF bytes. Owned by the source; never mutated. */
  bytes: Uint8Array;
  /** Number of pages in the original file. */
  pageCount: number;
}

export interface PageRef {
  /** Stable id, unique per page reference (survives reordering). */
  id: string;
  /** Which source PDF this page comes from. */
  sourceId: string;
  /** Zero-based page index inside the source PDF. */
  pageIndex: number;
  /** Extra clockwise rotation applied on top of the page's own rotation. */
  rotation: 0 | 90 | 180 | 270;
  /** Editable annotations placed on this page (drawn in on export). */
  annotations?: Annotation[];
}

export type FontFamily = "helvetica" | "times" | "courier";

/**
 * Shared placement of an annotation.
 *
 * Coordinates are PDF points in the page's *unrotated* box (its crop box),
 * measured from the TOP-LEFT corner with y pointing down — the same frame a
 * browser uses, which keeps the on-screen editor simple. `angle` turns the
 * annotation clockwise (degrees) about its top-left corner; new annotations
 * get the opposite of the page's rotation so they read upright on screen.
 */
export interface AnnotationBase {
  id: string;
  x: number;
  y: number;
  angle: number;
}

export interface TextAnnotation extends AnnotationBase {
  kind: "text";
  /** May contain line breaks. */
  text: string;
  /** Font size in points. */
  size: number;
  font: FontFamily;
  bold: boolean;
  italic: boolean;
  /** "#rrggbb". */
  color: string;
}

export interface ImageAnnotation extends AnnotationBase {
  kind: "image";
  /** Size in points. */
  width: number;
  height: number;
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  /** Object URL used to show the image on screen. */
  url: string;
  /**
   * Set once the background was removed: the image as imported (to adjust
   * or undo the removal) and the settings used. `crop` is the part of the
   * original image the cleaned image shows.
   */
  original?: { bytes: Uint8Array; mime: "image/png" | "image/jpeg"; url: string };
  cleanup?: { strength: number; crop: Crop };
}

/** A region of an image, as fractions of its width and height (0..1). */
export interface Crop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type Annotation = TextAnnotation | ImageAnnotation;

/**
 * A form field's value. Text fields hold their text; check boxes and radio
 * buttons hold the "on" value of the checked button, or "Off"; choice fields
 * hold the chosen option's display text.
 */
export type FieldValue = string;

/** Form values the user entered: source id → field name → value. */
export type FormValues = Record<string, Record<string, FieldValue>>;
