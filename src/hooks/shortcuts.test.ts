import { describe, expect, it } from "vitest";
import { isEditableTarget, matchShortcut, type KeyLike } from "./shortcuts";

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("matchShortcut", () => {
  it("maps Ctrl and ⌘ combinations", () => {
    expect(matchShortcut(key("o", { ctrlKey: true }))).toBe("open");
    expect(matchShortcut(key("A", { metaKey: true }))).toBe("selectAll");
    expect(matchShortcut(key("e", { ctrlKey: true }))).toBe("extract");
    expect(matchShortcut(key("s", { ctrlKey: true }))).toBe("export");
  });

  it("maps single keys", () => {
    expect(matchShortcut(key("Escape"))).toBe("clearSelection");
    expect(matchShortcut(key("Delete"))).toBe("delete");
    expect(matchShortcut(key("Backspace"))).toBe("delete");
    expect(matchShortcut(key("r"))).toBe("rotateRight");
    expect(matchShortcut(key("R", { shiftKey: true }))).toBe("rotateLeft");
    expect(matchShortcut(key("?", { shiftKey: true }))).toBe("help");
  });

  it("ignores unrelated or Alt-modified keys", () => {
    expect(matchShortcut(key("x"))).toBeNull();
    expect(matchShortcut(key("r", { ctrlKey: true }))).toBeNull();
    expect(matchShortcut(key("s", { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(matchShortcut(key("r", { altKey: true }))).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("detects form fields", () => {
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
