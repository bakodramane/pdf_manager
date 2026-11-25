// Minimal static server for dist/ used by the web E2E tests and for local
// checks of the GitHub Pages sub-path. Usage:
//   node scripts/serve-dist.mjs [port] [basePath]
// It binds to 127.0.0.1 only and serves files from dist/ (no directory
// listing, no traversal outside dist/).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const port = Number(process.argv[2] || 4173);
const base = (process.argv[3] || "/").replace(/\/?$/, "/");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".gz": "application/gzip",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (!url.pathname.startsWith(base)) {
      res.writeHead(404).end();
      return;
    }
    let rel = decodeURIComponent(url.pathname.slice(base.length)) || "index.html";
    if (rel.endsWith("/")) rel += "index.html";
    const file = normalize(join(root, rel));
    if (!file.startsWith(root + sep)) {
      res.writeHead(404).end();
      return;
    }
    const s = await stat(file);
    if (!s.isFile()) throw new Error("not a file");
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving dist/ at http://127.0.0.1:${port}${base}`);
});
