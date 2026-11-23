import type { MessageKey } from "../i18n";

export type ShortcutAction =
  | "open"
  | "selectAll"
  | "clearSelection"
  | "delete"
  | "rotateRight"
  | "rotateLeft"
  | "extract"
  | "export"
  | "undo"
  | "redo"
  | "help";

/** The subset of KeyboardEvent the matcher needs (easy to fake in tests). */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Map a key press to an editor action, or null. "Mod" means Ctrl on
 * Windows/Linux and ⌘ on macOS.
 */
export function matchShortcut(e: KeyLike): ShortcutAction | null {
  if (e.altKey) return null;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod) {
    if (e.shiftKey) return key === "z" ? "redo" : null;
    if (key === "z") return "undo";
    if (key === "y") return "redo";
    if (key === "o") return "open";
    if (key === "a") return "selectAll";
    if (key === "e") return "extract";
    if (key === "s") return "export";
    return null;
  }
  if (key === "escape") return "clearSelection";
  if (key === "delete" || key === "backspace") return "delete";
  if (key === "r") return e.shiftKey ? "rotateLeft" : "rotateRight";
  if (key === "?") return "help";
  return null;
}

/** Shortcut list for the help dialog, in display order. */
export const SHORTCUT_LIST: { keys: string[]; label: MessageKey }[] = [
  { keys: ["Mod", "O"], label: "shortcuts.open" },
  { keys: ["Mod", "Z"], label: "shortcuts.undo" },
  { keys: ["Mod", "Y"], label: "shortcuts.redo" },
  { keys: ["Mod", "A"], label: "shortcuts.selectAll" },
  { keys: ["Esc"], label: "shortcuts.clear" },
  { keys: ["R"], label: "shortcuts.rotateRight" },
  { keys: ["Shift", "R"], label: "shortcuts.rotateLeft" },
  { keys: ["Del"], label: "shortcuts.delete" },
  { keys: ["Mod", "E"], label: "shortcuts.extract" },
  { keys: ["Mod", "S"], label: "shortcuts.export" },
  { keys: ["?"], label: "shortcuts.help" },
];

/** True when typing in this element should not trigger shortcuts. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable === true
  );
}

export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Display label for a key, e.g. "Mod" → "Ctrl" or "⌘". */
export function keyLabel(key: string): string {
  if (key === "Mod") return IS_MAC ? "⌘" : "Ctrl";
  return key;
}
