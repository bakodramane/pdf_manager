import { describe, expect, it } from "vitest";
import { FULL_CROP, reframe, removeBackground, type RasterImage } from "./background";

/**
 * A 200×100 "photo": paper that darkens from white to grey left to right
 * (a shadow), a little noise, and a dark-blue horizontal stroke.
 */
function photo(): RasterImage {
  const width = 200;
  const height = 100;
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 7;
  const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 7) - 3;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const paper = 250 - (x / width) * 80 + noise();
      const ink = y >= 45 && y < 52 && x >= 40 && x < 160;
      data[i] = ink ? 20 : paper;
      data[i + 1] = ink ? 30 : paper;
      data[i + 2] = ink ? 140 : paper - 6;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

const alphaAt = (img: RasterImage, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

describe("removeBackground", () => {
  it("clears the paper, shadow included, and keeps the ink", () => {
    const result = removeBackground(photo())!;
    expect(result).not.toBeNull();
    const { image, crop } = result;
    // The stroke spans x 40–159, y 45–51; the result is trimmed around it.
    expect(crop.left * 200).toBeGreaterThan(30);
    expect(crop.right * 200).toBeLessThan(170);
    expect(crop.top * 100).toBeGreaterThan(35);
    expect(crop.bottom * 100).toBeLessThan(62);
    const ox = Math.round(crop.left * 200);
    const oy = Math.round(crop.top * 100);
    // Ink stays opaque, on the bright and on the shadowed side.
    expect(alphaAt(image, 50 - ox, 48 - oy)).toBe(255);
    expect(alphaAt(image, 150 - ox, 48 - oy)).toBe(255);
    // Paper next to the ink is transparent on both sides.
    expect(alphaAt(image, 50 - ox, 42 - oy)).toBe(0);
    expect(alphaAt(image, 150 - ox, 55 - oy)).toBe(0);
    // Ink keeps its colour.
    const i = ((48 - oy) * image.width + (100 - ox)) * 4;
    expect(image.data[i + 2]).toBeGreaterThan(image.data[i]);
  });

  it("returns null when there is only paper", () => {
    const blank: RasterImage = {
      width: 20,
      height: 20,
      data: new Uint8ClampedArray(20 * 20 * 4).fill(240),
    };
    expect(removeBackground(blank)).toBeNull();
  });

  it("keeps fainter strokes at a low strength than at a high one", () => {
    const img = photo();
    // Make the stroke a light grey.
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 2] === 140) {
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 190;
      }
    }
    const opacity = (strength: number) => {
      const r = removeBackground(img, strength);
      if (!r) return 0;
      const ox = Math.round(r.crop.left * 200);
      const oy = Math.round(r.crop.top * 100);
      return alphaAt(r.image, 50 - ox, 48 - oy);
    };
    expect(opacity(1)).toBeGreaterThan(opacity(10));
  });
});

describe("reframe", () => {
  const a = { x: 100, y: 50, width: 200, height: 100, angle: 0 };
  const crop = { left: 0.25, top: 0.1, right: 0.75, bottom: 0.6 };

  it("shrinks the frame around the kept part", () => {
    expect(reframe(a, FULL_CROP, crop)).toEqual({ x: 150, y: 60, width: 100, height: 50 });
  });

  it("round-trips, also when rotated", () => {
    const turned = { ...a, angle: 90 };
    const small = reframe(turned, FULL_CROP, crop);
    const back = reframe({ ...small, angle: 90 }, crop, FULL_CROP);
    expect(back.x).toBeCloseTo(100);
    expect(back.y).toBeCloseTo(50);
    expect(back.width).toBeCloseTo(200);
    expect(back.height).toBeCloseTo(100);
  });
});
