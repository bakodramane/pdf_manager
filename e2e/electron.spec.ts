import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { writeSamplePdf } from "./fixtures";

// Runs the real Electron shell against the production build (dist/), the
// same way the packaged app runs (app:// protocol, CSP, session policies).
// Requires a display: run under xvfb-run on Linux CI.

let app: ElectronApplication;
let page: Page;
const cspViolations: string[] = [];
const consoleErrors: string[] = [];

test.beforeAll(async () => {
  // Chromium refuses to start its OS-level sandbox as root (containers).
  // There, and only there, the test passes --no-sandbox; the renderer's
  // Electron `sandbox: true` restrictions are still checked below.
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  app = await electron.launch({
    args: [...(isRoot || process.env.E2E_NO_SANDBOX === "1" ? ["--no-sandbox"] : []), "."],
    // Chromium on Linux decodes file paths with the locale's encoding; CI
    // containers often have none, which breaks paths with accents. Windows
    // paths are UTF-16 and unaffected.
    env: {
      ...process.env,
      PDF_MANAGER_USE_DIST: "1",
      LANG: process.env.LANG || "C.UTF-8",
      LC_ALL: process.env.LC_ALL || "C.UTF-8",
    },
  });
  page = await app.firstWindow();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp ??= [];
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
});

test.afterAll(async () => {
  await app?.close();
});

test("loads from the private app:// origin with a strict CSP", async () => {
  expect(page.url()).toMatch(/^app:\/\/pdf-manager\/index\.html/);
  const csp = await page.evaluate(async () => {
    const r = await fetch(location.href);
    return r.headers.get("content-security-policy");
  });
  expect(csp).toContain("default-src 'none'");
  expect(csp).not.toContain(" 'unsafe-eval'");
});

test("renderer has no Node.js and a single, narrow bridge", async () => {
  const probe = await page.evaluate(() => ({
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
    module: typeof (window as unknown as { module?: unknown }).module,
    bridge: Object.keys((window as unknown as { pdfManager?: object }).pdfManager ?? {}),
  }));
  expect(probe).toEqual({ require: "undefined", process: "undefined", module: "undefined", bridge: ["setLanguage"] });
});

test("main-process window preferences are hardened", async () => {
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    // Not in the public typings, but present at runtime.
    const p = (wc as unknown as { getLastWebPreferences(): Record<string, unknown> }).getLastWebPreferences() ?? {};
    return {
      nodeIntegration: p.nodeIntegration,
      contextIsolation: p.contextIsolation,
      sandbox: p.sandbox,
      webSecurity: p.webSecurity,
      webviewTag: p.webviewTag,
      // DevTools are disabled in production: opening them has no effect.
      devTools: (wc.openDevTools(), wc.isDevToolsOpened()),
    };
  });
  expect(prefs).toEqual({
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    webviewTag: false,
    devTools: false,
  });
});

test("outbound network requests are blocked (CSP and session policy)", async () => {
  const results = await page.evaluate(async () => {
    const attempt = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        return "allowed";
      } catch {
        return "blocked";
      }
    };
    const ws = await new Promise<string>((resolve) => {
      try {
        const sock = new WebSocket("wss://example.com/");
        sock.onopen = () => resolve("allowed");
        sock.onerror = () => resolve("blocked");
        setTimeout(() => resolve("blocked"), 5000);
      } catch {
        resolve("blocked");
      }
    });
    const img = await new Promise<string>((resolve) => {
      const el = new Image();
      el.onload = () => resolve("allowed");
      el.onerror = () => resolve("blocked");
      el.src = "https://example.com/favicon.ico";
      setTimeout(() => resolve("blocked"), 5000);
    });
    return {
      https: await attempt(() => fetch("https://example.com/")),
      http: await attempt(() => fetch("http://example.com/")),
      cdn: await attempt(() => fetch("https://cdn.jsdelivr.net/npm/tesseract.js-core/package.json")),
      localhost: await attempt(() => fetch("http://localhost:5173/")),
      file: await attempt(() => fetch("file:///etc/hosts")),
      ws,
      img,
    };
  });
  expect(results).toEqual({
    https: "blocked",
    http: "blocked",
    cdn: "blocked",
    localhost: "blocked",
    file: "blocked",
    ws: "blocked",
    img: "blocked",
  });
});

test("session request filter blocks the network independently of the CSP", async () => {
  // session.fetch goes through the same webRequest filter as page requests
  // but is not subject to the page's CSP, so this checks the second layer.
  const result = await app.evaluate(async ({ session }) => {
    const probe = async (u: string) => {
      try {
        await session.defaultSession.fetch(u);
        return "allowed";
      } catch (e) {
        return String((e as Error).message).includes("ERR_BLOCKED_BY_CLIENT") ? "blocked" : `error: ${(e as Error).message}`;
      }
    };
    return {
      https: await probe("https://example.com/"),
      http: await probe("http://example.com/"),
      app: await probe("app://pdf-manager/index.html").then((r) => (r === "allowed" ? "allowed" : r)),
    };
  });
  expect(result).toEqual({ https: "blocked", http: "blocked", app: "allowed" });
});

test("the app protocol does not serve files outside dist/", async () => {
  const statuses = await page.evaluate(async () => {
    const s = async (u: string) => {
      try {
        return (await fetch(u)).status;
      } catch {
        return -1;
      }
    };
    return [
      await s("app://pdf-manager/../package.json"),
      await s("app://pdf-manager/%2e%2e/package.json"),
      await s("app://pdf-manager/..%2fpackage.json"),
      await s("app://pdf-manager/electron/main.cjs"),
      await s("app://pdf-manager/does-not-exist.js"),
    ];
  });
  for (const st of statuses) expect([404, -1]).toContain(st);
});

test("opens a PDF and renders pages without CSP violations", async () => {
  const file = await writeSamplePdf(3);
  await expect(page.getByRole("heading", { name: "PDF Manager" })).toBeVisible();
  // Earlier tests provoke violations on purpose (blocked network probes).
  await page.evaluate(() => ((window as unknown as { __csp: string[] }).__csp = []));
  await page.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles(file);
  await expect(page.getByText(/3 pages/i).first()).toBeVisible({ timeout: 30_000 });
  // Thumbnails are rendered by the PDF.js worker into data: URLs.
  await expect(page.locator("img[src^='data:image/png']").first()).toBeVisible({ timeout: 30_000 });
  const violations = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
  cspViolations.push(...violations);
  expect(cspViolations).toEqual([]);
});

test("navigation, new windows and permissions are denied", async () => {
  const before = page.url();
  await page.evaluate(() => {
    location.href = "https://example.com/";
  });
  await page.waitForTimeout(1000);
  expect(page.url()).toBe(before);

  const opened = await page.evaluate(() => window.open("https://example.com/") === null);
  expect(opened).toBe(true);
  expect(app.windows()).toHaveLength(1);

  const perms = await page.evaluate(async () => {
    const notif = await Notification.requestPermission();
    const geo = await new Promise<string>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve("granted"),
        () => resolve("denied"),
        { timeout: 3000 },
      );
    });
    const media = await navigator.mediaDevices
      .getUserMedia({ video: true })
      .then(() => "granted")
      .catch(() => "denied");
    const clipRead = await navigator.clipboard
      .readText()
      .then(() => "granted")
      .catch(() => "denied");
    return { notif, geo, media, clipRead };
  });
  expect(perms).toEqual({ notif: "denied", geo: "denied", media: "denied", clipRead: "denied" });
});
