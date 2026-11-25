/**
 * Does a page already have a useful text layer? Scanned pages usually have
 * none (or only a few stray characters, e.g. a page number added later).
 * Pages that do are skipped by default so OCR never duplicates real text.
 */
export const MIN_TEXT_CHARS = 25;

export function hasUsefulText(items: readonly { str?: string }[], minChars = MIN_TEXT_CHARS): boolean {
  let count = 0;
  for (const it of items) {
    const s = it.str;
    if (!s) continue;
    for (const ch of s) {
      if (/\S/u.test(ch)) count += 1;
      if (count >= minChars) return true;
    }
  }
  return false;
}
