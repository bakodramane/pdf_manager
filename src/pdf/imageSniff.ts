/**
 * Identify an image from its first bytes (magic numbers), and read its
 * declared dimensions where the header holds them, without decoding it.
 * Used to reject files whose content does not match an accepted format and
 * to refuse "decompression bombs" (tiny files declaring huge dimensions)
 * before the browser allocates their pixels.
 */

export type SniffedType = "png" | "jpeg" | "gif" | "webp" | "bmp";

export interface Sniffed {
  type: SniffedType;
  /** Declared width/height (0 when the header does not say). */
  width: number;
  height: number;
  /** JPEG only: an EXIF (APP1) segment was found before the image data. */
  exif?: boolean;
}

/** How many leading bytes `sniffImage` needs to see everything it checks. */
export const SNIFF_BYTES = 64 * 1024;

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const i32le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

export function sniffImage(b: Uint8Array): Sniffed | null {
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && ascii(b, 12, 4) === "IHDR") {
    return { type: "png", width: u32be(b, 16), height: u32be(b, 20) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return sniffJpeg(b);
  if (b.length >= 10 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) {
    return { type: "gif", width: u16le(b, 6), height: u16le(b, 8) };
  }
  if (b.length >= 30 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
    const chunk = ascii(b, 12, 4);
    if (chunk === "VP8X") {
      const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
      const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
      return { type: "webp", width: w, height: h };
    }
    if (chunk === "VP8 ") return { type: "webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { type: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return { type: "webp", width: 0, height: 0 };
  }
  if (b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d) {
    return { type: "bmp", width: Math.abs(i32le(b, 18)), height: Math.abs(i32le(b, 22)) };
  }
  return null;
}

/** Walk JPEG marker segments up to the frame header (SOFn). */
function sniffJpeg(b: Uint8Array): Sniffed {
  let o = 2;
  let exif = false;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) break;
    const marker = b[o + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      o += 2;
      continue;
    }
    const len = u16be(b, o + 2);
    if (len < 2) break;
    if (marker === 0xe1 && ascii(b, o + 4, 4) === "Exif") exif = true;
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { type: "jpeg", height: u16be(b, o + 5), width: u16be(b, o + 7), exif };
    }
    if (marker === 0xda) break; // start of scan: no frame header found
    o += 2 + len;
  }
  return { type: "jpeg", width: 0, height: 0, exif };
}
