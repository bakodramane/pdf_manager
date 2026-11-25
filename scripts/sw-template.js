/* PDF Manager service worker (web edition only; never used by the desktop app).
 *
 * Generated at build time from scripts/sw-template.js: the version, the
 * precache list and the OCR pack version are filled in by vite.config.ts.
 *
 * What it caches (Cache Storage, this site only):
 *  - the application itself (precached at install) and PDF.js resources /
 *    fonts the first time they are used;
 *  - OCR language packs, ONLY after the user presses "Make available
 *    offline" for them.
 * What it never caches: documents, images, signatures or anything the user
 * opens or creates. Those never leave the page (they are not fetched at
 * all), so they never pass through here.
 */
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const OCR_VERSION = "__OCR_VERSION__";
const SHELL = `pdfm-shell-${VERSION}`;
const RUNTIME = `pdfm-runtime-${VERSION}`;
const OCR = `pdfm-ocr-${OCR_VERSION}`;
const RUNTIME_PREFIXES = ["pdfjs/", "fonts/"];
const scope = new URL(self.registration.scope);

const rel = (url) => {
  const u = new URL(url);
  return u.origin === scope.origin && u.pathname.startsWith(scope.pathname) ? u.pathname.slice(scope.pathname.length) : null;
};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((p) => new URL(p, scope).href))));
  // No skipWaiting(): a new version waits until the user chooses to reload,
  // so an open document is never interrupted and versions never mix.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("pdfm-") && ![SHELL, RUNTIME, OCR].includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const path = rel(req.url);
  if (path === null) return; // other origins and paths: not ours to answer
  event.respondWith(
    (async () => {
      if (req.mode === "navigate") {
        const shell = await caches.open(SHELL);
        const cached = await shell.match(new URL("index.html", scope).href);
        if (cached) return cached;
        return fetch(req);
      }
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && RUNTIME_PREFIXES.some((p) => path.startsWith(p))) {
        const copy = res.clone();
        caches.open(RUNTIME).then((c) => c.put(req, copy));
      }
      return res;
    })(),
  );
});

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  const port = event.ports && event.ports[0];
  const reply = (data) => port && port.postMessage(data);
  if (msg.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (msg.type === "STATUS") {
    event.waitUntil(
      (async () => {
        const shell = await caches.open(SHELL);
        const shellReady = (await shell.keys()).length >= PRECACHE.length;
        const ocr = await caches.open(OCR);
        const cached = (await ocr.keys()).map((r) => rel(r.url));
        reply({ version: VERSION, shellReady, ocrFiles: cached });
      })(),
    );
  } else if (msg.type === "PREPARE_OCR" && Array.isArray(msg.files)) {
    event.waitUntil(
      (async () => {
        const ocr = await caches.open(OCR);
        let done = 0;
        try {
          for (const file of msg.files) {
            if (typeof file !== "string" || !file.startsWith("ocr/") || file.includes("..")) continue;
            const url = new URL(file, scope).href;
            if (!(await ocr.match(url))) {
              const res = await fetch(url, { cache: "no-store" });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              await ocr.put(url, res);
            }
            // Read the stored copy back in full before reporting it ready, so
            // "available offline" is only shown for files that really are.
            const stored = await ocr.match(url);
            if (!stored || (await stored.arrayBuffer()).byteLength === 0) throw new Error("cache write failed");
            reply({ progress: ++done, total: msg.files.length });
          }
          reply({ done: true });
        } catch (err) {
          reply({ error: String(err && err.message ? err.message : err) });
        }
      })(),
    );
  } else if (msg.type === "RESET") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pdfm-")).map((k) => caches.delete(k))))
        .then(() => reply({ done: true })),
    );
  }
});
