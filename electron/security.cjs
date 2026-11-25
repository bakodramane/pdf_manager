"use strict";
/**
 * Security policy for the desktop shell, kept free of `require("electron")`
 * so every decision can be unit-tested with plain Node (security.test.ts).
 *
 * Model
 * - The packaged renderer is served from a private, privileged scheme
 *   (`app://pdf-manager/`) that maps only onto the built `dist/` folder.
 *   No `file://` access is granted to page content.
 * - The renderer may load nothing from the network. Every request that is
 *   not for the app's own origin (or an in-memory `blob:`/`data:` URL) is
 *   cancelled. In development the single, exact Vite dev-server origin is
 *   also allowed.
 * - Navigation is limited to the app's own entry page.
 * - Only a short allowlist of HTTPS pages (author, project, releases,
 *   documentation) may be handed to the system browser, and only when the
 *   user clicks a link.
 */

const path = require("path");

const APP_SCHEME = "app";
const APP_HOST = "pdf-manager";
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const APP_ENTRY = `${APP_ORIGIN}/index.html`;
const DEV_ORIGIN = "http://localhost:5173";
const SUPPORTED_LANGS = ["en", "fr"];

/**
 * Production Content Security Policy (sent as a response header for every
 * app:// document and worker). See docs/security/threat-model.md.
 * - 'wasm-unsafe-eval' lets the bundled PDF.js decoders and the OCR engine
 *   compile their local WebAssembly. It does not allow JavaScript eval().
 * - style-src 'unsafe-inline' is needed for React `style` attributes (page
 *   positions, zoom); no inline <script> is ever allowed.
 * - blob:/data: cover in-memory rendering (thumbnails, downloads, images).
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "connect-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "manifest-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** Hosts and path prefixes that may be opened in the system browser. */
const EXTERNAL_ALLOWLIST = [
  { host: "github.com", pathPrefix: "/bakodramane" },
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff2": "font/woff2",
  ".icc": "application/vnd.iccprofile",
  ".gz": "application/gzip",
  ".traineddata": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
};

/** Parse a URL without throwing. */
function parseUrl(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 8192) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** True when `raw` is exactly on the app origin (app://pdf-manager). */
function isAppUrl(raw) {
  const u = parseUrl(raw);
  return !!u && u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST && !u.username && !u.password;
}

/** True when `raw` is exactly on the dev-server origin (no prefix tricks). */
function isDevUrl(raw) {
  const u = parseUrl(raw);
  return !!u && u.origin === DEV_ORIGIN && !u.username && !u.password;
}

/**
 * Map an app:// request onto a file inside `rootDir`. Returns the absolute
 * path, or null if the request is outside the app, malformed, or tries to
 * escape the root (`..`, encoded separators, NUL bytes, drive letters, UNC).
 * Symlinks are checked separately by the caller (it needs the filesystem).
 */
function resolveAppAsset(rootDir, rawUrl) {
  const u = parseUrl(rawUrl);
  if (!u || u.protocol !== `${APP_SCHEME}:` || u.host !== APP_HOST) return null;
  if (u.username || u.password || u.port) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(u.pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0") || pathname.includes("\\")) return null;
  if (pathname === "/" || pathname === "") pathname = "/index.html";
  const segments = pathname.split("/").filter((s) => s.length > 0);
  if (segments.some((s) => s === "." || s === ".." || /^[a-zA-Z]:$/.test(s))) return null;
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, ...segments);
  const rel = path.relative(root, resolved);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

/** True when `candidate` (a real path) lies inside `root` (a real path). */
function isInside(root, candidate) {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function mimeTypeFor(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".traineddata.gz")) return MIME_TYPES[".gz"];
  return MIME_TYPES[path.extname(lower)] || "application/octet-stream";
}

/** Headers sent with every app:// response. */
function responseHeaders(filePath) {
  return {
    "Content-Type": mimeTypeFor(filePath),
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  };
}

/** May the main window navigate to this URL? Only the app's entry page. */
function isAllowedNavigation(rawUrl, { isDev } = { isDev: false }) {
  const u = parseUrl(rawUrl);
  if (!u) return false;
  if (isAppUrl(rawUrl)) return u.pathname === "/index.html" || u.pathname === "/";
  if (isDev && isDevUrl(rawUrl)) return true;
  return false;
}

/**
 * May the renderer (or a worker) make this request? Only the app's own
 * origin and in-memory URLs; in development also the exact dev server
 * (http + its HMR websocket).
 */
function isAllowedRequest(rawUrl, { isDev } = { isDev: false }) {
  const u = parseUrl(rawUrl);
  if (!u) return false;
  if (isAppUrl(rawUrl)) return true;
  if (u.protocol === "blob:") {
    // blob:app://pdf-manager/<uuid> — only blobs created by the app itself.
    return isAppUrl(rawUrl.slice("blob:".length)) || (isDev && isDevUrl(rawUrl.slice(5)));
  }
  if (u.protocol === "data:") return true;
  if (u.protocol === "devtools:") return isDev;
  if (isDev) {
    if (isDevUrl(rawUrl)) return true;
    if (u.protocol === "ws:" && u.host === "localhost:5173") return true;
  }
  return false;
}

/** May this URL be opened in the system browser after a user click? */
function isAllowedExternalUrl(rawUrl) {
  const u = parseUrl(rawUrl);
  if (!u || u.protocol !== "https:") return false;
  if (u.username || u.password || u.port) return false;
  return EXTERNAL_ALLOWLIST.some(
    ({ host, pathPrefix }) =>
      u.hostname === host &&
      (u.pathname === pathPrefix || u.pathname.startsWith(`${pathPrefix}/`)),
  );
}

/** Validate the payload of the `app:set-language` IPC message. */
function isValidLanguage(value) {
  return typeof value === "string" && SUPPORTED_LANGS.includes(value);
}

/**
 * Validate the sender of an IPC message: it must be the main frame of one of
 * our windows, currently showing the app (not some page it was tricked into
 * loading).
 */
function isTrustedSender({ senderFrameUrl, isMainFrame, isOurWindow, isDev }) {
  if (!isOurWindow || !isMainFrame) return false;
  return isAppUrl(senderFrameUrl) || (isDev && isDevUrl(senderFrameUrl));
}

/** Permissions the renderer may use (everything else is denied). */
const ALLOWED_PERMISSIONS = new Set(["clipboard-sanitized-write"]);

function isAllowedPermission(permission, requestingUrl, { isDev } = { isDev: false }) {
  if (!ALLOWED_PERMISSIONS.has(permission)) return false;
  return isAppUrl(requestingUrl) || (isDev && isDevUrl(requestingUrl));
}

module.exports = {
  APP_SCHEME,
  APP_HOST,
  APP_ORIGIN,
  APP_ENTRY,
  DEV_ORIGIN,
  SUPPORTED_LANGS,
  CSP,
  EXTERNAL_ALLOWLIST,
  isAppUrl,
  isDevUrl,
  resolveAppAsset,
  isInside,
  mimeTypeFor,
  responseHeaders,
  isAllowedNavigation,
  isAllowedRequest,
  isAllowedExternalUrl,
  isValidLanguage,
  isTrustedSender,
  isAllowedPermission,
};
