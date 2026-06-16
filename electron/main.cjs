"use strict";
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const DEV_URL = "http://localhost:5173";
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "PDF Manager",
    backgroundColor: "#0f1115",
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

  // Open target="_blank" links in the OS browser, never in a new Electron
  // window (there are none in this app, but be defensive).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      setImmediate(() => shell.openExternal(url));
    }
    return { action: "deny" };
  });

  if (isDev) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // Load the Vite-built app from the local filesystem.
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
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
