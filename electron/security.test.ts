// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const sec = require("./security.cjs");
const { MENU_COMMANDS } = require("./menu.cjs");

const ROOT = path.resolve("/opt/pdf-manager/resources/app.asar/dist");

describe("app:// asset resolution", () => {
  it("serves files inside dist/", () => {
    expect(sec.resolveAppAsset(ROOT, "app://pdf-manager/index.html")).toBe(path.join(ROOT, "index.html"));
    expect(sec.resolveAppAsset(ROOT, "app://pdf-manager/")).toBe(path.join(ROOT, "index.html"));
    expect(sec.resolveAppAsset(ROOT, "app://pdf-manager/assets/a%20b.js?x=1#y")).toBe(
      path.join(ROOT, "assets", "a b.js"),
    );
  });

  it.each([
    "app://pdf-manager/../secret.txt",
    "app://pdf-manager/%2e%2e/secret.txt",
    "app://pdf-manager/assets/%2e%2e/%2e%2e/%2e%2e/secret.txt",
    "app://pdf-manager/./../../../../etc/passwd",
  ])("keeps dot-segment request %s inside dist/", (url) => {
    // The URL parser removes dot segments before we see the path, so these
    // collapse to a file *inside* the root (which then 404s); they must never
    // resolve outside it.
    const resolved = sec.resolveAppAsset(ROOT, url);
    expect(resolved === null || sec.isInside(ROOT, resolved)).toBe(true);
  });

  it.each([
    "app://pdf-manager/assets/..%2f..%2fsecret.txt",
    "app://pdf-manager/assets/..%5c..%5csecret.txt",
    "app://pdf-manager/C:/Windows/win.ini",
    "app://pdf-manager/%00index.html",
    "app://pdf-manager/index.html%00.png",
    "app://pdf-manager/%E0%A4%A",
    "app://other-host/index.html",
    "app://user:pw@pdf-manager/index.html",
    "file:///etc/passwd",
    "http://pdf-manager/index.html",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(sec.resolveAppAsset(ROOT, url)).toBeNull();
  });

  it("detects paths outside the root", () => {
    expect(sec.isInside(ROOT, path.join(ROOT, "a/b.js"))).toBe(true);
    expect(sec.isInside(ROOT, path.join(ROOT, "..", "x"))).toBe(false);
    expect(sec.isInside(ROOT, ROOT)).toBe(false);
  });

  it("sends the CSP and strict headers with every response", () => {
    const h = sec.responseHeaders(path.join(ROOT, "index.html"));
    expect(h["Content-Security-Policy"]).toBe(sec.CSP);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Type"]).toMatch(/^text\/html/);
    expect(sec.mimeTypeFor("x.wasm")).toBe("application/wasm");
    expect(sec.mimeTypeFor("x.mjs")).toMatch(/javascript/);
    expect(sec.mimeTypeFor("eng.traineddata.gz")).toBe("application/gzip");
    expect(sec.mimeTypeFor("x.unknown")).toBe("application/octet-stream");
  });
});

describe("Content Security Policy", () => {
  const directives = Object.fromEntries(
    sec.CSP.split(";").map((d: string) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values];
    }),
  );
  it("denies by default and never allows JavaScript eval or remote code", () => {
    expect(directives["default-src"]).toEqual(["'none'"]);
    expect(sec.CSP).not.toContain("'unsafe-eval'");
    expect(directives["script-src"]).not.toContain("'unsafe-inline'");
    expect(sec.CSP).not.toMatch(/https?:/);
    expect(directives["object-src"]).toEqual(["'none'"]);
    expect(directives["frame-ancestors"]).toEqual(["'none'"]);
    expect(directives["base-uri"]).toEqual(["'none'"]);
  });
});

describe("navigation policy", () => {
  it("allows only the app entry page", () => {
    expect(sec.isAllowedNavigation("app://pdf-manager/index.html")).toBe(true);
    expect(sec.isAllowedNavigation("app://pdf-manager/index.html?lang=fr")).toBe(true);
    expect(sec.isAllowedNavigation("app://pdf-manager/assets/x.js")).toBe(false);
  });

  it.each([
    "https://evil.example/",
    "http://localhost:5173/",
    "http://localhost:5173.evil.example/",
    "http://localhost:51730/",
    "http://localhost:5173@evil.example/",
    "file:///C:/Windows/System32/",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "app://evil/index.html",
  ])("blocks %s in production", (url) => {
    expect(sec.isAllowedNavigation(url, { isDev: false })).toBe(false);
  });

  it("allows only the exact dev origin in development", () => {
    expect(sec.isAllowedNavigation("http://localhost:5173/?lang=fr", { isDev: true })).toBe(true);
    expect(sec.isAllowedNavigation("http://localhost:5173.evil.example/", { isDev: true })).toBe(false);
    expect(sec.isAllowedNavigation("http://localhost:5173@evil.example/", { isDev: true })).toBe(false);
    expect(sec.isAllowedNavigation("https://localhost:5173/", { isDev: true })).toBe(false);
    expect(sec.isAllowedNavigation("http://127.0.0.1:5173/", { isDev: true })).toBe(false);
  });
});

describe("network request policy", () => {
  it("allows the app origin and in-memory URLs only", () => {
    expect(sec.isAllowedRequest("app://pdf-manager/assets/pdf.worker.mjs")).toBe(true);
    expect(sec.isAllowedRequest("blob:app://pdf-manager/0b5c7d1e-1111-2222-3333-444455556666")).toBe(true);
    expect(sec.isAllowedRequest("data:image/png;base64,AAAA")).toBe(true);
  });

  it.each([
    "https://cdn.jsdelivr.net/npm/tesseract.js-core/tesseract-core.wasm",
    "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz",
    "http://example.com/",
    "ws://example.com/socket",
    "wss://example.com/socket",
    "ftp://example.com/",
    "file:///etc/passwd",
    "blob:https://evil.example/123",
    "http://localhost:5173/",
    "devtools://devtools/bundled/inspector.html",
  ])("cancels %s in production", (url) => {
    expect(sec.isAllowedRequest(url, { isDev: false })).toBe(false);
  });

  it("allows the dev server and its HMR socket in development only", () => {
    expect(sec.isAllowedRequest("http://localhost:5173/src/main.tsx", { isDev: true })).toBe(true);
    expect(sec.isAllowedRequest("ws://localhost:5173/", { isDev: true })).toBe(true);
    expect(sec.isAllowedRequest("http://localhost:5174/", { isDev: true })).toBe(false);
    expect(sec.isAllowedRequest("https://example.com/", { isDev: true })).toBe(false);
  });
});

describe("external links", () => {
  it("opens only allowlisted HTTPS pages", () => {
    expect(sec.isAllowedExternalUrl("https://github.com/bakodramane")).toBe(true);
    expect(sec.isAllowedExternalUrl("https://github.com/bakodramane/pdf_manager/releases")).toBe(true);
  });

  it.each([
    "http://github.com/bakodramane",
    "https://github.com/bakodramane-evil",
    "https://github.com/someone-else",
    "https://github.com.evil.example/bakodramane",
    "https://evil.example/github.com/bakodramane",
    "https://user@github.com/bakodramane",
    "https://github.com:8443/bakodramane",
    "file:///C:/Windows/System32/calc.exe",
    "ms-msdt:/id PCWDiagnostic",
    "search-ms:query=x",
    "javascript:alert(1)",
    "\\\\attacker\\share\\x.exe",
    "",
  ])("refuses %s", (url) => {
    expect(sec.isAllowedExternalUrl(url)).toBe(false);
  });
});

describe("IPC validation", () => {
  it("accepts only supported language codes", () => {
    expect(sec.isValidLanguage("en")).toBe(true);
    expect(sec.isValidLanguage("fr")).toBe(true);
    for (const bad of ["de", "EN", "", "en ", null, undefined, 1, {}, ["en"], "x".repeat(10000)]) {
      expect(sec.isValidLanguage(bad)).toBe(false);
    }
  });

  it("trusts only the main frame of our window showing the app", () => {
    const ok = { senderFrameUrl: "app://pdf-manager/index.html", isMainFrame: true, isOurWindow: true, isDev: false };
    expect(sec.isTrustedSender(ok)).toBe(true);
    expect(sec.isTrustedSender({ ...ok, isMainFrame: false })).toBe(false);
    expect(sec.isTrustedSender({ ...ok, isOurWindow: false })).toBe(false);
    expect(sec.isTrustedSender({ ...ok, senderFrameUrl: "https://evil.example/" })).toBe(false);
    expect(sec.isTrustedSender({ ...ok, senderFrameUrl: "http://localhost:5173/" })).toBe(false);
    expect(sec.isTrustedSender({ ...ok, senderFrameUrl: "http://localhost:5173/", isDev: true })).toBe(true);
  });

  it("forwards only fixed menu commands", () => {
    expect(MENU_COMMANDS).toEqual([
      "open", "export", "close", "undo", "redo", "zoomIn", "zoomOut", "zoomReset", "shortcuts", "credits",
    ]);
  });
});

describe("permissions", () => {
  it.each([
    "media", "geolocation", "notifications", "midi", "midiSysex", "pointerLock",
    "openExternal", "clipboard-read", "hid", "serial", "usb", "display-capture",
    "fullscreen", "idle-detection", "window-management", "storage-access",
  ])("denies %s", (permission) => {
    expect(sec.isAllowedPermission(permission, "app://pdf-manager/index.html")).toBe(false);
  });

  it("allows clipboard writes from the app only", () => {
    expect(sec.isAllowedPermission("clipboard-sanitized-write", "app://pdf-manager/index.html")).toBe(true);
    expect(sec.isAllowedPermission("clipboard-sanitized-write", "https://evil.example/")).toBe(false);
  });
});
