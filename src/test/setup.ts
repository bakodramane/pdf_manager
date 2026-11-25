// Test-environment shims. The app targets Electron's Chromium and current
// browsers, where these exist; Node 22 (used for unit tests) lacks some.
if (typeof (Promise as { try?: unknown }).try !== "function") {
  Object.defineProperty(Promise, "try", {
    configurable: true,
    writable: true,
    value<T>(fn: (...args: unknown[]) => T | PromiseLike<T>, ...args: unknown[]) {
      return new Promise<T>((resolve) => resolve(fn(...args)));
    },
  });
}
