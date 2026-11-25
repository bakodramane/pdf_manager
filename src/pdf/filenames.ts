/**
 * Safe names for files the app saves. Names come from user files (which may
 * contain anything), so they are cleaned before being offered as a download
 * name: no path separators, no characters Windows forbids, no control or
 * bidirectional-override characters (which can disguise an extension), no
 * reserved device names, and a bounded length.
 */

const FORBIDDEN = /[<>:"/\\|?*]/g;
// C0/C1 controls and Unicode bidi/format controls (e.g. U+202E RLO).
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;
const MAX_STEM = 120;

/** Clean one file name stem (no extension). */
export function sanitizeStem(stem: string, fallback = "document"): string {
  let s = stem.normalize("NFC").replace(CONTROL, "").replace(FORBIDDEN, "_");
  s = s.replace(/\s+/g, " ").trim();
  // Windows drops trailing dots and spaces; leading dots hide files on Unix.
  s = s.replace(/[. ]+$/g, "").replace(/^\.+/, "");
  if (s.length > MAX_STEM) s = s.slice(0, MAX_STEM).trim();
  if (!s || RESERVED.test(s)) s = s ? `${s}_` : fallback;
  return s;
}

/** Clean an extension (letters and digits only). */
export function sanitizeExtension(ext: string): string {
  const clean = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  return clean.slice(0, 10) || "bin";
}

/**
 * Produce a safe output file name from a source name, a suffix and an
 * extension: "Report.pdf" + "_edited" → "Report_edited.pdf".
 */
export function deriveName(base: string, suffix: string, ext = "pdf"): string {
  const name = base.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${sanitizeStem(stem + suffix)}.${sanitizeExtension(ext)}`;
}
