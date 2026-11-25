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

// Bundled fonts are fetched over the app origin in the browser; unit tests
// read the same files from node_modules.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setFontLoader } from "../pdf/fonts";

const requireFromHere = createRequire(import.meta.url);
const NOTO: Record<string, string> = {
  regular: "400Regular/NotoSans_400Regular.ttf",
  bold: "700Bold/NotoSans_700Bold.ttf",
  italic: "400Regular_Italic/NotoSans_400Regular_Italic.ttf",
  boldItalic: "700Bold_Italic/NotoSans_700Bold_Italic.ttf",
};
setFontLoader(async (style) =>
  new Uint8Array(readFileSync(requireFromHere.resolve(`@expo-google-fonts/noto-sans/${NOTO[style]}`))),
);
