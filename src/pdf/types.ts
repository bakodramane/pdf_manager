/**
 * Core data model for the editor.
 *
 * The editor works on a flat ordered list of "page references". Each page
 * reference points back to a loaded source PDF and a page index within it.
 * This makes reorder / delete / insert / merge trivial array operations and
 * keeps the heavy PDF bytes loaded only once per source file.
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
}
