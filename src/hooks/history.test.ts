import { describe, expect, it } from "vitest";
import { createHistory, pushHistory, redoHistory, undoHistory } from "./history";

describe("history", () => {
  it("undoes and redoes in order", () => {
    let h = createHistory(1);
    h = pushHistory(h, 2);
    h = pushHistory(h, 3);
    h = undoHistory(h);
    expect(h.present).toBe(2);
    h = undoHistory(h);
    expect(h.present).toBe(1);
    h = redoHistory(h);
    expect(h.present).toBe(2);
    h = redoHistory(h);
    expect(h.present).toBe(3);
  });

  it("is a no-op at either end", () => {
    const h = createHistory("a");
    expect(undoHistory(h)).toBe(h);
    expect(redoHistory(h)).toBe(h);
  });

  it("drops redo steps after a new change", () => {
    let h = pushHistory(createHistory(1), 2);
    h = undoHistory(h);
    h = pushHistory(h, 5);
    expect(h.future).toEqual([]);
    expect(redoHistory(h).present).toBe(5);
    expect(undoHistory(h).present).toBe(1);
  });

  it("ignores changes that equal the present", () => {
    const h = createHistory([1, 2]);
    const same = (a: number[], b: number[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    expect(pushHistory(h, [1, 2], same)).toBe(h);
    expect(pushHistory(h, [2, 1], same).past).toHaveLength(1);
  });

  it("keeps at most `limit` undo steps", () => {
    let h = createHistory(0);
    for (let i = 1; i <= 10; i++) h = pushHistory(h, i, Object.is, 3);
    expect(h.past).toEqual([7, 8, 9]);
  });
});
