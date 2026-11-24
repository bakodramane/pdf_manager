import { useEffect, useRef } from "react";
import { isEditableTarget, matchShortcut, type ShortcutAction } from "./shortcuts";

/**
 * Listen for the editor's keyboard shortcuts on the window. Shortcuts are
 * ignored while typing in a field, while a dialog is open, or when
 * `enabled` is false (e.g. during a long-running operation).
 */
export function useShortcuts(
  onAction: (action: ShortcutAction) => void,
  enabled: boolean,
): void {
  const handler = useRef(onAction);
  handler.current = onAction;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (isEditableTarget(e.target)) return;
      if (document.querySelector("dialog[open]")) return;
      const action = matchShortcut(e);
      if (!action) return;
      e.preventDefault();
      handler.current(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
