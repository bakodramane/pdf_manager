"use strict";
// Preload script — runs in a sandboxed context with contextIsolation: true.
// It exposes exactly one function to the page: reporting the UI language so
// the main process can show the window menu in the same language. Nothing
// else (no Node.js, no generic IPC) is reachable from the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pdfManager", {
  setLanguage(lang) {
    if (typeof lang === "string") ipcRenderer.send("app:set-language", lang);
  },
});
