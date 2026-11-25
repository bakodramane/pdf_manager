import { describe, expect, it } from "vitest";
import { parsePath } from "./extract";

const IDENTITY: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

describe("parsePath (PDF.js 5+ constructPath format)", () => {
  it("reads a rectangle as a closed 4-point polyline", () => {
    // moveTo(10,20) lineTo(110,20) lineTo(110,70) lineTo(10,70) closePath
    const data = new Float32Array([0, 10, 20, 1, 110, 20, 1, 110, 70, 1, 10, 70, 4]);
    const { polylines } = parsePath([22 /* fill */, [data], null], IDENTITY);
    expect(polylines).toHaveLength(1);
    expect(polylines[0]).toEqual([
      [10, 20],
      [110, 20],
      [110, 70],
      [10, 70],
      [10, 20],
    ]);
  });

  it("drops curved sub-paths and keeps straight ones", () => {
    const data = new Float32Array([
      0, 0, 0, 2, 1, 1, 2, 2, 3, 3, // curved
      0, 5, 5, 1, 50, 5, // straight
    ]);
    const { polylines } = parsePath([20, [data], null], IDENTITY);
    expect(polylines).toEqual([[[5, 5], [50, 5]]]);
  });

  it("applies the current transform and tolerates malformed input", () => {
    const data = new Float32Array([0, 1, 1, 1, 2, 1]);
    const { polylines } = parsePath([20, [data], null], [2, 0, 0, 2, 10, 10]);
    expect(polylines[0]).toEqual([[12, 12], [14, 12]]);
    expect(parsePath([20, undefined, null], IDENTITY).polylines).toEqual([]);
    expect(parsePath([20, [new Float32Array([99, 1, 2])], null], IDENTITY).polylines).toEqual([]);
  });
});
