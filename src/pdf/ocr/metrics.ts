/**
 * Character and word error rates (CER/WER) for the OCR benchmark: the edit
 * distance between recognised and reference text divided by the reference
 * length. Whitespace is normalised; case and accents are kept (an "é" read
 * as "e" is an error).
 */

function levenshtein<T>(a: readonly T[], b: readonly T[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export const normaliseText = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

export function cer(recognised: string, reference: string): number {
  const ref = [...normaliseText(reference)];
  const hyp = [...normaliseText(recognised)];
  return ref.length ? levenshtein(hyp, ref) / ref.length : hyp.length ? 1 : 0;
}

export function wer(recognised: string, reference: string): number {
  const ref = normaliseText(reference).split(" ").filter(Boolean);
  const hyp = normaliseText(recognised).split(" ").filter(Boolean);
  return ref.length ? levenshtein(hyp, ref) / ref.length : hyp.length ? 1 : 0;
}
