/**
 * Bundled Unicode fonts (Noto Sans, SIL Open Font License; see
 * public/fonts/OFL.txt). Served from the app's own origin and fetched only
 * when needed: for the OCR text layer, and for annotations containing
 * characters the 14 standard PDF fonts cannot encode.
 */

export type UnicodeFontStyle = "regular" | "bold" | "italic" | "boldItalic";

export const UNICODE_FONT_FILES: Record<UnicodeFontStyle, string> = {
  regular: "NotoSans-Regular.ttf",
  bold: "NotoSans-Bold.ttf",
  italic: "NotoSans-Italic.ttf",
  boldItalic: "NotoSans-BoldItalic.ttf",
};

export type FontLoader = (style: UnicodeFontStyle) => Promise<Uint8Array>;

const cache = new Map<UnicodeFontStyle, Promise<Uint8Array>>();

/** Browser loader: same-origin fetch, cached per style for the session. */
const browserLoader: FontLoader = (style) => {
  let p = cache.get(style);
  if (!p) {
    p = fetch(new URL(`fonts/${UNICODE_FONT_FILES[style]}`, document.baseURI).href)
      .then((r) => {
        if (!r.ok) throw new Error("Bundled font missing.");
        return r.arrayBuffer();
      })
      .then((b) => new Uint8Array(b));
    p.catch(() => cache.delete(style));
    cache.set(style, p);
  }
  return p;
};

let loader: FontLoader = browserLoader;

export function loadUnicodeFont(style: UnicodeFontStyle): Promise<Uint8Array> {
  return loader(style);
}

/** Replace the loader (unit tests running in Node read the files directly). */
export function setFontLoader(next: FontLoader | null): void {
  loader = next ?? browserLoader;
}

export function styleOf(bold: boolean, italic: boolean): UnicodeFontStyle {
  return bold ? (italic ? "boldItalic" : "bold") : italic ? "italic" : "regular";
}
