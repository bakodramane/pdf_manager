"use strict";
const { app, BrowserWindow, Menu, ipcMain, nativeTheme, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { buildMenuTemplate, MENU_COMMANDS } = require("./menu.cjs");

const DEV_URL = "http://localhost:5173";
const isDev = !app.isPackaged;
const SUPPORTED_LANGS = ["en", "fr"];
const AUTHOR_URL = "https://github.com/bakodramane";
const isMac = process.platform === "darwin";

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
    const lang = fs.readFileSync(file, "utf8").trim().toLowerCase();
    return SUPPORTED_LANGS.includes(lang) ? lang : null;
  } catch {
    return null;
  }
}

/**
 * Run a menu command in the renderer. It is delivered as a DOM event via
 * executeJavaScript with `userGesture = true`, so commands such as "Open…"
 * may open the file picker (browsers only allow that after user input).
 * `command` comes from the fixed MENU_COMMANDS list, never from the page.
 */
function sendMenuCommand(command, win) {
  const target = win || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!target || !MENU_COMMANDS.includes(command)) return;
  const detail = JSON.stringify(command);
  target.webContents
    .executeJavaScript(
      `window.dispatchEvent(new CustomEvent("pdfmanager:menu", { detail: ${detail} }))`,
      true,
    )
    .catch(() => undefined);
}

function applyMenu(lang) {
  menuLang = lang;
  const template = buildMenuTemplate(lang, {
    isDev,
    isMac,
    send: sendMenuCommand,
    openAuthorPage: () => shell.openExternal(AUTHOR_URL),
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// The renderer reports its UI language (on start-up and whenever the user
// switches), so the menu always matches the app.
ipcMain.on("app:set-language", (event, lang) => {
  const fromOurWindow = BrowserWindow.getAllWindows().some(
    (w) => w.webContents === event.sender,
  );
  if (!fromOurWindow || !SUPPORTED_LANGS.includes(lang) || lang === menuLang) return;
  applyMenu(lang);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "PDF Manager",
    // Match the renderer's light/dark theme to avoid a flash on start-up.
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b0d13" : "#f4f5f9",
    webPreferences: {
      // Security hardening: no Node in renderer, full context isolation,
      // sandbox, no remote module.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
      // Disable features the app does not use.
      webgl: true,          // canvas needs this
      webSecurity: true,    // never disable; file:// -> file:// allowed below
      allowRunningInsecureContent: false,
    },
  });

  // Block all external navigation — the app is offline and nothing should
  // open a URL in or out of the window.
  win.webContents.on("will-navigate", (event, url) => {
    const parsed = new URL(url);
    const isLocal =
      parsed.protocol === "file:" ||
      (isDev && url.startsWith(DEV_URL));
    if (!isLocal) {
      event.preventDefault();
    }
  });

  // Open target="_blank" links (e.g. the author credit) in the OS browser,
  // never in a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      setImmediate(() => shell.openExternal(url));
    }
    return { action: "deny" };
  });

  const lang = installerLanguage();
  if (isDev) {
    win.loadURL(lang ? `${DEV_URL}/?lang=${lang}` : DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // Load the Vite-built app from the local filesystem.
    win.loadFile(
      path.join(__dirname, "../dist/index.html"),
      lang ? { query: { lang } } : undefined,
    );
  }
}

app.whenReady().then(() => {
  // Start with the installer's language (or the OS language) until the
  // renderer reports the language it actually shows.
  const osLang = app.getLocale().toLowerCase().startsWith("fr") ? "fr" : "en";
  applyMenu(installerLanguage() || osLang);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

// Prevent the app from making ANY network connections for auto-update.
// electron-builder's updater won't be configured, but belt-and-suspenders.
app.on("certificate-error", (event) => event.preventDefault());
