"use strict";
// Preload script — runs in a sandboxed context with contextIsolation: true.
// The renderer needs no Node.js APIs (the app is pure client-side), so
// nothing is exposed through contextBridge. This file exists to satisfy
// Electron's hard requirement that a preload path be specified when sandbox
// is enabled.
