import type { PageRef } from "./types";
import { AppError } from "./errors";

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

/**
 * Parse a page-range string such as "1-3, 7, 10-" into zero-based page
 * indices, in the order typed (duplicates are dropped after their first
 * appearance).
 *
 * Accepted tokens, separated by commas, semicolons, or spaces:
 *   "7"     a single page
 *   "1-3"   an inclusive range ("5-2" runs backwards: 5, 4, 3, 2)
 *   "10-"   from page 10 to the last page
 *   "-3"    from the first page to page 3
 *
 * Throws AppError("invalidRange") for malformed tokens and
 * AppError("rangeOutOfBounds") for pages outside 1..pageCount.
 */
export function parsePageRanges(input: string, pageCount: number): number[] {
  const tokens = input
    .replace(/[\u2013\u2014]/g, "-") // en/em dashes typed or pasted
    .replace(/\s*-\s*/g, "-")
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    throw new AppError("invalidRange", "No pages given.", { range: input.trim() });
  }

  const result: number[] = [];
  const seen = new Set<number>();
  const push = (page: number) => {
    if (!seen.has(page)) {
      seen.add(page);
      result.push(page - 1);
    }
  };

  for (const token of tokens) {
    const match = /^(\d*)-(\d*)$|^(\d+)$/.exec(token);
    if (!match || token === "-") {
      throw new AppError("invalidRange", `Invalid page range "${token}".`, {
        range: token,
      });
    }
    const [from, to] =
      match[3] !== undefined
        ? [Number(match[3]), Number(match[3])]
        : [match[1] ? Number(match[1]) : 1, match[2] ? Number(match[2]) : pageCount];
    for (const page of [from, to]) {
      if (page < 1 || page > pageCount) {
        throw new AppError(
          "rangeOutOfBounds",
          `Page ${page} is outside 1-${pageCount}.`,
          { page, max: pageCount },
        );
      }
    }
    const step = from <= to ? 1 : -1;
    for (let page = from; page !== to + step; page += step) push(page);
  }
  return result;
}

/**
 * Duplicate the selected pages: each copy is inserted right after its
 * original, with fresh ids (annotations are copied too, with new ids, so
 * editing one copy never changes the other).
 */
export function duplicatePages(
  pages: PageRef[],
  ids: Set<string>,
  newId: (prefix: string) => string,
): PageRef[] {
  const out: PageRef[] = [];
  for (const p of pages) {
    out.push(p);
    if (ids.has(p.id)) {
      out.push({
        ...p,
        id: newId("pg"),
        annotations: p.annotations?.map((a) => ({ ...a, id: newId("an") })),
      });
    }
  }
  return out;
}

/**
 * Move the selected pages one step earlier (-1) or later (+1), keeping
 * their relative order — a keyboard alternative to drag-and-drop.
 */
export function shiftPages(pages: PageRef[], ids: Set<string>, step: -1 | 1): PageRef[] {
  const next = pages.slice();
  const order = step < 0 ? [...next.keys()] : [...next.keys()].reverse();
  for (const i of order) {
    const j = i + step;
    if (!ids.has(next[i].id) || j < 0 || j >= next.length || ids.has(next[j].id)) continue;
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}
