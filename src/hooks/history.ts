/**
 * Minimal immutable undo/redo history. `present` is the current state;
 * `past` holds older states (most recent last) and `future` the states
 * undone so far (next redo first).
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

/** Maximum number of undo steps kept (older steps are dropped). */
export const HISTORY_LIMIT = 50;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Record `next` as the new present. Any redo steps are discarded. If `next`
 * is equal to the present (per `isSame`), the history is returned unchanged
 * so no-op edits never create empty undo steps.
 */
export function pushHistory<T>(
  history: History<T>,
  next: T,
  isSame: (a: T, b: T) => boolean = Object.is,
  limit = HISTORY_LIMIT,
): History<T> {
  if (isSame(history.present, next)) return history;
  const past = [...history.past, history.present];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, present: next, future: [] };
}

export function undoHistory<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  const past = history.past.slice(0, -1);
  const previous = history.past[history.past.length - 1];
  return { past, present: previous, future: [history.present, ...history.future] };
}

export function redoHistory<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history;
  const [next, ...future] = history.future;
  return { past: [...history.past, history.present], present: next, future };
}
