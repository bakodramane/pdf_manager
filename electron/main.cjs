"use strict";
const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  nativeTheme,
  protocol,
  session,
  shell,
} = require("electron");
const fs = require("fs");
const path = require("path");
const { buildMenuTemplate, MENU_COMMANDS } = require("./menu.cjs");
const sec = require("./security.cjs");

// Development mode (Vite dev server, DevTools) is only possible when running
// from a source checkout; packaged builds are always production. Setting
// PDF_MANAGER_USE_DIST=1 runs a checkout against the built dist/ exactly as
// the packaged app does (used by the Electron smoke tests).
const isDev = !app.isPackaged && process.env.PDF_MANAGER_USE_DIST !== "1";
const isMac = process.platform === "darwin";
const AUTHOR_URL = "https://github.com/bakodramane";
/** Built renderer (Vite output). Only files below it are ever served. */
const DIST_DIR = path.join(__dirname, "..", "dist");

// Every renderer runs sandboxed, whatever its webPreferences say. Packaged
// builds always do this. Only a source checkout started with --no-sandbox
// (needed to run Chromium as root inside CI containers) skips it.
if (app.isPackaged || !app.commandLine.hasSwitch("no-sandbox")) {
  app.enableSandbox();
}

// The private scheme the packaged app is served from. "standard" + "secure"
// give it a real origin (needed for workers, fetch and the CSP 'self'
// keyword) without touching file:// at all.
protocol.registerSchemesAsPrivileged([
  {
    scheme: sec.APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

/** Language of the window menu; follows the app's UI language. */
let menuLang = "en";

/**
 * The NSIS installer writes the language the user picked during setup to
 * `ui-language.txt` next to the executable (see build/installer.nsh). The
 * renderer uses it as the default UI language until the user picks another
 * one in the app. Portable builds have no such file and fall back to the
 * operating-system language.
 */
function installerLanguage() {
  try {
    const file = path.join(path.dirname(process.execPath), "ui-language.txt");
    const lang = fs.readFileSync(file, "utf8").slice(0, 8).trim().toLowerCase();
    return sec.isValidLanguage(lang) ? lang : null;
  } catch {
    return null;
  }
}

/** Is this webContents one of our windows, currently showing the app? */
function isOurWindowContents(contents) {
  return BrowserWindow.getAllWindows().some((w) => w.webContents === contents);
}

function showsApp(contents) {
  const url = contents.getURL();
  return sec.isAppUrl(url) || (isDev && sec.isDevUrl(url));
}

/**
 * Run a menu command in the renderer. It is delivered as a DOM event via
 * executeJavaScript with `userGesture = true`, so commands such as "Open…"
 * may open the file picker (browsers only allow that after user input).
 * The script is a constant: `command` must be one of the fixed MENU_COMMANDS
 * and is JSON-encoded; nothing from the page is ever evaluated.
 */
function sendMenuCommand(command, win) {
  const target = win || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!target || !MENU_COMMANDS.includes(command)) return;
  if (!showsApp(target.webContents)) return;
  const detail = JSON.stringify(command);
  target.webContents
    .executeJavaScript(
      `window.dispatchEvent(new CustomEvent("pdfmanager:menu", { detail: ${detail} }))`,
      true,
    )
    .catch(() => undefined);
}

/** Open an allowlisted HTTPS page in the system browser. */
function openExternalSafely(url) {
  if (sec.isAllowedExternalUrl(url)) {
    shell.openExternal(url).catch(() => undefined);
  }
}

function applyMenu(lang) {
  menuLang = lang;
  const template = buildMenuTemplate(lang, {
    isDev,
    isMac,
    send: sendMenuCommand,
    openAuthorPage: () => openExternalSafely(AUTHOR_URL),
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// The renderer reports its UI language (on start-up and whenever the user
// switches), so the menu always matches the app. The sender must be the
// main frame of one of our windows showing the app; the payload must be one
// of the supported language codes.
ipcMain.on("app:set-language", (event, lang) => {
  const frame = event.senderFrame;
  const trusted = sec.isTrustedSender({
    senderFrameUrl: frame ? frame.url : "",
    isMainFrame: !!frame && frame === event.sender.mainFrame,
    isOurWindow: isOurWindowContents(event.sender),
    isDev,
  });
  if (!trusted || !sec.isValidLanguage(lang) || lang === menuLang) return;
  applyMenu(lang);
});

/** Serve app://pdf-manager/<path> from dist/, with the production CSP. */
function registerAppProtocol(ses) {
  let realRoot = DIST_DIR;
  try {
    realRoot = fs.realpathSync(DIST_DIR);
  } catch {
    // dist/ missing: every request 404s below.
  }
  ses.protocol.handle(sec.APP_SCHEME, async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405 });
    }
    const filePath = sec.resolveAppAsset(DIST_DIR, request.url);
    if (!filePath) return new Response(null, { status: 404 });
    try {
      // Resolve symlinks first and read only that resolved path, which must
      // lie inside dist/ (none are shipped). No separate existence/type
      // check before reading: a directory or missing file simply fails the
      // read. (fs.open is avoided on purpose: inside app.asar Electron would
      // extract the file to a temporary folder.)
      const real = await fs.promises.realpath(filePath).catch(() => filePath);
      if (real !== filePath && !sec.isInside(realRoot, real)) {
        return new Response(null, { status: 404 });
      }
      const body = await fs.promises.readFile(real);
      return new Response(body, { status: 200, headers: sec.responseHeaders(real) });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

/**
 * Session-wide defence in depth: no network, no permissions, no devices,
 * no downloads except the app's own in-memory files.
 */
function hardenSession(ses) {
  // 1. Network: cancel every request that is not for the app itself.
  ses.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !sec.isAllowedRequest(details.url, { isDev }) });
  });

  // 2. Permissions (camera, microphone, geolocation, notifications,
  //    clipboard read, MIDI, HID, USB, serial, …): denied, except writing
  //    text to the clipboard after a user action (copy recognised text).
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const url = (details && details.requestingUrl) || (wc ? wc.getURL() : "");
    callback(sec.isAllowedPermission(permission, url, { isDev }));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    sec.isAllowedPermission(permission, requestingOrigin, { isDev }),
  );
  ses.setDevicePermissionHandler(() => false);
  ses.on("select-hid-device", (event, _details, callback) => {
    event.preventDefault();
    callback("");
  });
  ses.on("select-serial-port", (event, _ports, _wc, callback) => {
    event.preventDefault();
    callback("");
  });
  ses.on("select-usb-device", (event, _details, callback) => {
    event.preventDefault();
    callback("");
  });

  // 3. Downloads: only files the app generated in memory (blob:/data: URLs
  //    created by the app). Electron then shows the native Save dialog.
  ses.on("will-download", (event, item) => {
    const url = item.getURL();
    const ok =
      (url.startsWith("blob:") && sec.isAllowedRequest(url, { isDev })) ||
      url.startsWith("data:");
    if (!ok) event.preventDefault();
  });
}

function createWindow(lang) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "PDF Manager",
    // Window/taskbar icon on Windows and Linux (the .exe icon comes from
    // build/icon.ico via electron-builder).
    icon: path.join(__dirname, isDev ? "../public/icon.png" : "../dist/icon.png"),
    // Match the renderer's light/dark theme to avoid a flash on start-up.
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b0d13" : "#f4f5f9",
    webPreferences: {
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      // DevTools only in development builds.
      devTools: isDev,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  if (isDev) {
    win.loadURL(lang ? `${sec.DEV_ORIGIN}/?lang=${lang}` : sec.DEV_ORIGIN);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadURL(lang ? `${sec.APP_ENTRY}?lang=${lang}` : sec.APP_ENTRY);
  }
  return win;
}

// Applies to every webContents the app ever creates (windows, devtools).
app.on("web-contents-created", (_event, contents) => {
  const blockNavigation = (event, url) => {
    if (!sec.isAllowedNavigation(url, { isDev })) event.preventDefault();
  };
  contents.on("will-navigate", blockNavigation);
  contents.on("will-redirect", blockNavigation);
  contents.on("will-frame-navigate", (event) => {
    if (!event.isMainFrame) {
      // The app never embeds frames.
      event.preventDefault();
      return;
    }
    if (!sec.isAllowedNavigation(event.url, { isDev })) event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());

  // No new Electron windows, ever. A user click on an allowlisted HTTPS
  // link (e.g. the author credit) opens it in the system browser.
  contents.setWindowOpenHandler(({ url }) => {
    if (showsApp(contents)) openExternalSafely(url);
    return { action: "deny" };
  });
});

app.whenReady().then(() => {
  const ses = session.defaultSession;
  registerAppProtocol(ses);
  hardenSession(ses);

  // Start with the installer's language (or the OS language) until the
  // renderer reports the language it actually shows.
  const lang = installerLanguage();
  const osLang = app.getLocale().toLowerCase().startsWith("fr") ? "fr" : "en";
  applyMenu(lang || osLang);
  createWindow(lang);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(installerLanguage());
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

// TLS: Electron rejects invalid certificates by default; this handler only
// makes that explicit. (The renderer has no network access anyway.)
app.on("certificate-error", (event, _wc, _url, _error, _cert, callback) => {
  event.preventDefault();
  callback(false);
});
