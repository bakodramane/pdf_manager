import type { PageRef } from "./types";

/**
 * Pure, immutable operations on an ordered list of page references.
 * None of these touch PDF bytes — they only reshape the working order.
 * Keeping them pure makes them trivial to unit-test.
 */

type Rotation = PageRef["rotation"];

export function normalizeRotation(deg: number): Rotation {
  const r = ((deg % 360) + 360) % 360;
  return r as Rotation;
}

/** Remove every page whose id is in `ids`. */
export function deletePages(pages: PageRef[], ids: Set<string>): PageRef[] {
  return pages.filter((p) => !ids.has(p.id));
}

/** Rotate the selected pages by `delta` degrees (clockwise). */
export function rotatePages(
  pages: PageRef[],
  ids: Set<string>,
  delta: number,
): PageRef[] {
  return pages.map((p) =>
    ids.has(p.id)
      ? { ...p, rotation: normalizeRotation(p.rotation + delta) }
      : p,
  );
}

/** Keep only the selected pages, preserving current order. */
export function extractPages(pages: PageRef[], ids: Set<string>): PageRef[] {
  return pages.filter((p) => ids.has(p.id));
}

/**
 * Move the page at `from` to `to` (array indices). Returns a new array.
 * Out-of-range indices are clamped.
 */
export function movePage(pages: PageRef[], from: number, to: number): PageRef[] {
  const n = pages.length;
  if (n === 0) return pages;
  const src = Math.max(0, Math.min(n - 1, from));
  const dst = Math.max(0, Math.min(n - 1, to));
  if (src === dst) return pages;
  const next = pages.slice();
  const [moved] = next.splice(src, 1);
  next.splice(dst, 0, moved);
  return next;
}

/**
 * Insert `incoming` page references right after array index `afterIndex`.
 * Pass -1 to insert at the very beginning.
 */
export function insertPages(
  pages: PageRef[],
  incoming: PageRef[],
  afterIndex: number,
): PageRef[] {
  const at = Math.max(-1, Math.min(pages.length - 1, afterIndex)) + 1;
  const next = pages.slice();
  next.splice(at, 0, ...incoming);
  return next;
}

/**
 * Split an ordered list into chunks at the given 1-based "split after page N"
 * boundaries. e.g. splitAt([...10 pages], [3, 7]) -> [1-3], [4-7], [8-10].
 */
export function splitIntoRanges(
  pages: PageRef[],
  boundaries: number[],
): PageRef[][] {
  const sorted = Array.from(new Set(boundaries))
    .filter((b) => b >= 1 && b < pages.length)
    .sort((a, b) => a - b);
  const chunks: PageRef[][] = [];
  let start = 0;
  for (const b of sorted) {
    chunks.push(pages.slice(start, b));
    start = b;
  }
  chunks.push(pages.slice(start));
  return chunks.filter((c) => c.length > 0);
}
