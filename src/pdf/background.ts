import { rotateVec } from "./annotations";
import type { Crop } from "./types";

export type { Crop } from "./types";

/**
 * Background removal for signature images (scans and photos of a signature
 * on paper). Pure functions on raw RGBA pixels, so they run anywhere.
 *
 * 1. Estimate the paper colour locally, on a coarse grid, so shadows and
 *    uneven lighting in photos are treated as paper too.
 * 2. Give each pixel an opacity from how much darker it is than the paper
 *    around it (per channel, so coloured ink counts), with a soft edge.
 * 3. Remove the paper's tint from semi-transparent edge pixels, so no light
 *    halo remains around the strokes.
 * 4. Trim the empty margins.
 */

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row by row. */
  data: Uint8ClampedArray;
}

export const FULL_CROP: Crop = { left: 0, top: 0, right: 1, bottom: 1 };

/** Strength range offered to the user (higher removes more). */
export const MIN_STRENGTH = 1;
export const MAX_STRENGTH = 10;
export const DEFAULT_STRENGTH = 5;

/** Pixels at or below this opacity count as background when trimming. */
const TRIM_ALPHA = 24;

/** Paper colour per grid cell: the bright end of each channel. */
function estimateBackground(img: RasterImage, cell: number) {
  const { width, height, data } = img;
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);
  const grid = new Float32Array(gw * gh * 3);
  const known = new Uint8Array(gw * gh);
  const hist = new Uint32Array(256 * 3);

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      hist.fill(0);
      let count = 0;
      const x1 = Math.min(width, (gx + 1) * cell);
      const y1 = Math.min(height, (gy + 1) * cell);
      for (let y = gy * cell; y < y1; y++) {
        for (let x = gx * cell; x < x1; x++) {
          const i = (y * width + x) * 4;
          if (data[i + 3] < 128) continue; // already transparent
          hist[data[i]]++;
          hist[256 + data[i + 1]]++;
          hist[512 + data[i + 2]]++;
          count++;
        }
      }
      if (count === 0) continue;
      // 90th percentile: paper is the brightest common colour; ink strokes
      // are thin, so they rarely reach it.
      const target = count * 0.9;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let v = 0;
        for (; v < 255; v++) {
          sum += hist[c * 256 + v];
          if (sum >= target) break;
        }
        grid[(gy * gw + gx) * 3 + c] = v;
      }
      known[gy * gw + gx] = 1;
    }
  }

  // Cells covered by ink (or fully transparent) borrow from their brightest
  // neighbour; then a light blur evens out the grid.
  const smooth = new Float32Array(grid.length);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      for (let c = 0; c < 3; c++) {
        let best = -1;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = gx + dx;
            const ny = gy + dy;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || !known[ny * gw + nx]) continue;
            best = Math.max(best, grid[(ny * gw + nx) * 3 + c]);
          }
        }
        smooth[(gy * gw + gx) * 3 + c] = best < 0 ? 255 : best;
      }
    }
  }
  const blurred = new Float32Array(grid.length);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = gx + dx;
            const ny = gy + dy;
            if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
            sum += smooth[(ny * gw + nx) * 3 + c];
            n++;
          }
        }
        blurred[(gy * gw + gx) * 3 + c] = sum / n;
      }
    }
  }
  return { grid: blurred, gw, gh };
}

/**
 * Make the paper behind a signature transparent and trim the margins.
 * `strength` runs from MIN_STRENGTH (keeps faint strokes, may leave some
 * background) to MAX_STRENGTH (clean background, may thin faint strokes).
 *
 * Returns the cleaned, trimmed image and where it sits in the input, or
 * `null` when nothing but background was found.
 */
export function removeBackground(
  img: RasterImage,
  strength = DEFAULT_STRENGTH,
): { image: RasterImage; crop: Crop } | null {
  const { width, height, data } = img;
  const s = Math.min(MAX_STRENGTH, Math.max(MIN_STRENGTH, strength));
  // Darkness (0..1, relative to the paper) where opacity starts, and the
  // width of the soft ramp up to fully opaque.
  const threshold = 0.04 + s * 0.03;
  const ramp = 0.14;

  const cell = Math.max(8, Math.round(Math.max(width, height) / 24));
  const { grid, gw, gh } = estimateBackground(img, cell);
  const out = new Uint8ClampedArray(data.length);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const bg = [0, 0, 0];

  for (let y = 0; y < height; y++) {
    // Bilinear interpolation between cell centres.
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / cell - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(gh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / cell - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(gw - 1, x0 + 1);
      const tx = fx - x0;
      for (let c = 0; c < 3; c++) {
        const a = grid[(y0 * gw + x0) * 3 + c];
        const b = grid[(y0 * gw + x1) * 3 + c];
        const d = grid[(y1 * gw + x0) * 3 + c];
        const e = grid[(y1 * gw + x1) * 3 + c];
        bg[c] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
      }

      const i = (y * width + x) * 4;
      let dark = 0;
      for (let c = 0; c < 3; c++) {
        const paper = Math.max(bg[c], 1);
        dark = Math.max(dark, (paper - data[i + c]) / paper);
      }
      const alpha = Math.min(1, Math.max(0, (dark - threshold) / ramp)) * (data[i + 3] / 255);
      const a8 = Math.round(alpha * 255);
      out[i + 3] = a8;
      if (a8 > 0) {
        // The pixel is ink blended over paper; keep only the ink colour.
        for (let c = 0; c < 3; c++) {
          out[i + c] = bg[c] + (data[i + c] - bg[c]) / Math.max(alpha, 0.2);
        }
      }
      if (a8 > TRIM_ALPHA) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;

  // Trim, keeping a small margin so strokes are not cut at the edge.
  const pad = Math.max(2, Math.round(Math.max(maxX - minX, maxY - minY) * 0.03));
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const right = Math.min(width, maxX + 1 + pad);
  const bottom = Math.min(height, maxY + 1 + pad);
  const w = right - left;
  const h = bottom - top;
  const trimmed = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((top + y) * width + left) * 4;
    trimmed.set(out.subarray(from, from + w * 4), y * w * 4);
  }
  return {
    image: { width: w, height: h, data: trimmed },
    crop: { left: left / width, top: top / height, right: right / width, bottom: bottom / height },
  };
}

/**
 * Placement of an image annotation when it switches from showing the part
 * `from` of the original image to the part `to`, so the picture itself stays
 * exactly where it is on the page (only its frame grows or shrinks).
 */
export function reframe(
  a: { x: number; y: number; width: number; height: number; angle: number },
  from: Crop,
  to: Crop,
): { x: number; y: number; width: number; height: number } {
  const fullW = a.width / (from.right - from.left);
  const fullH = a.height / (from.bottom - from.top);
  const [dx, dy] = rotateVec(
    (to.left - from.left) * fullW,
    (to.top - from.top) * fullH,
    a.angle,
  );
  return {
    x: a.x + dx,
    y: a.y + dy,
    width: fullW * (to.right - to.left),
    height: fullH * (to.bottom - to.top),
  };
}
