/**
 * Web edition only: service-worker registration, update flow, offline
 * status, explicit OCR pack preparation and reset. Nothing here runs in the
 * desktop app (app:// pages never register a service worker).
 */

export const PWA_SUPPORTED =
  typeof window !== "undefined" &&
  import.meta.env.PROD &&
  "serviceWorker" in navigator &&
  /^https?:$/.test(location.protocol) &&
  !window.pdfManager;

type Listener = () => void;
let waiting: ServiceWorker | null = null;
const updateListeners = new Set<Listener>();

/** Register the service worker; `onUpdate` fires when a new version is waiting. */
export async function registerServiceWorker(): Promise<void> {
  if (!PWA_SUPPORTED) return;
  const reg = await navigator.serviceWorker.register(new URL("sw.js", document.baseURI).href, {
    scope: "./",
    updateViaCache: "none",
  });
  const track = (sw: ServiceWorker | null) => {
    if (!sw) return;
    sw.addEventListener("statechange", () => {
      if (sw.state === "installed" && navigator.serviceWorker.controller) {
        waiting = sw;
        updateListeners.forEach((l) => l());
      }
    });
  };
  if (reg.waiting && navigator.serviceWorker.controller) {
    waiting = reg.waiting;
    updateListeners.forEach((l) => l());
  }
  track(reg.installing);
  reg.addEventListener("updatefound", () => track(reg.installing));
}

export function onUpdateAvailable(listener: Listener): () => void {
  updateListeners.add(listener);
  if (waiting) listener();
  return () => updateListeners.delete(listener);
}

/** Switch to the waiting version and reload (only when the user asks). */
export function applyUpdate(): void {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
  waiting.postMessage({ type: "SKIP_WAITING" });
}

function ask<T>(message: object, onMessage?: (data: Record<string, unknown>) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const sw = navigator.serviceWorker.controller;
    if (!sw) {
      reject(new Error("offline-not-ready"));
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => {
      const data = e.data as Record<string, unknown>;
      if (data.error) reject(new Error(String(data.error)));
      else if (!onMessage || onMessage(data)) resolve(data as T);
    };
    sw.postMessage(message, [channel.port2]);
  });
}

export interface OfflineStatus {
  shellReady: boolean;
  ocrFiles: string[];
}

export async function offlineStatus(): Promise<OfflineStatus | null> {
  if (!PWA_SUPPORTED || !navigator.serviceWorker.controller) return null;
  const sw = await ask<OfflineStatus>({ type: "STATUS" });
  // Report OCR files from what this page can actually read back.
  return { shellReady: sw.shellReady, ocrFiles: await visibleOcrFiles() };
}

/** OCR files present in this site's caches, as seen from the page. */
async function visibleOcrFiles(): Promise<string[]> {
  const out: string[] = [];
  const base = new URL(".", document.baseURI).href;
  for (const name of await caches.keys()) {
    if (!name.startsWith("pdfm-ocr-")) continue;
    for (const req of await (await caches.open(name)).keys()) {
      if (req.url.startsWith(base)) out.push(req.url.slice(base.length));
    }
  }
  return out;
}

/** OCR files needed offline for the given languages on this browser. */
export async function ocrFilesFor(langs: ("eng" | "fra")[]): Promise<string[]> {
  // Same choice of WebAssembly build as the OCR engine makes.
  const { simd, relaxedSimd } = await import("wasm-feature-detect");
  const core = (await relaxedSimd())
    ? "tesseract-core-relaxedsimd-lstm.wasm.js"
    : (await simd())
      ? "tesseract-core-simd-lstm.wasm.js"
      : "tesseract-core-lstm.wasm.js";
  return ["ocr/worker.min.js", `ocr/core/${core}`, "fonts/NotoSans-Regular.ttf", ...langs.map((l) => `ocr/lang/${l}.traineddata.gz`)];
}

/**
 * Download and keep OCR files for offline use (explicit user action).
 * Resolves only once every file can be read back from the cache by this
 * page, so "available offline" is never shown too early.
 */
export async function prepareOcr(files: string[], onProgress: (done: number, total: number) => void): Promise<void> {
  await ask<void>({ type: "PREPARE_OCR", files }, (data) => {
    if (typeof data.progress === "number") onProgress(data.progress, Number(data.total));
    return data.done === true;
  });
  const wanted = files.filter((f) => f.startsWith("ocr/"));
  for (let attempt = 0; attempt < 50; attempt++) {
    const have = new Set(await visibleOcrFiles());
    if (wanted.every((f) => have.has(f))) {
      // And readable in full.
      for (const f of wanted) {
        const res = await caches.match(new URL(f, document.baseURI).href);
        if (!res || (await res.arrayBuffer()).byteLength === 0) throw new Error("cache write failed");
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("cache write failed");
}

/** Remove everything this site stored for offline use (caches and preferences). */
export async function resetOfflineData(): Promise<void> {
  if (navigator.serviceWorker?.controller) await ask({ type: "RESET" }).catch(() => undefined);
  const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
  await Promise.all(regs.map((r) => r.unregister()));
  try {
    localStorage.removeItem("pdfm.lang");
  } catch {
    // storage unavailable: nothing to remove
  }
}
