"use strict";
/**
 * Window menu (File / Edit / View / Help) in English or French.
 *
 * Kept free of `require("electron")` so it can be checked with plain Node;
 * main.cjs passes in the callbacks.
 *
 * App commands (Open, Undo, …) show their shortcut in the menu but do NOT
 * register it (`registerAccelerator: false`): the renderer already handles
 * those keys, and registering them too would run each action twice and steal
 * Ctrl+Z from text fields.
 */

const LABELS = {
  en: {
    file: "&File",
    open: "Open PDF…",
    export: "Download edited PDF",
    close: "Close document",
    quit: "Quit",
    edit: "&Edit",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    view: "&View",
    resetZoom: "Actual size",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fullscreen: "Full screen",
    reload: "Reload",
    devtools: "Developer tools",
    help: "&Help",
    shortcuts: "Keyboard shortcuts",
    credits: "Credits",
    authorPage: "Author's GitHub page",
  },
  fr: {
    file: "&Fichier",
    open: "Ouvrir un PDF…",
    export: "Télécharger le PDF modifié",
    close: "Fermer le document",
    quit: "Quitter",
    edit: "É&dition",
    undo: "Annuler",
    redo: "Rétablir",
    cut: "Couper",
    copy: "Copier",
    paste: "Coller",
    view: "&Affichage",
    resetZoom: "Taille réelle",
    zoomIn: "Zoom avant",
    zoomOut: "Zoom arrière",
    fullscreen: "Plein écran",
    reload: "Recharger",
    devtools: "Outils de développement",
    help: "Aid&e",
    shortcuts: "Raccourcis clavier",
    credits: "Crédits",
    authorPage: "Page GitHub de l'auteur",
  },
};

/** Commands the menu may send to the renderer (checked again there). */
const MENU_COMMANDS = ["open", "export", "close", "undo", "redo", "shortcuts", "credits"];

/**
 * @param {"en"|"fr"} lang
 * @param {{
 *   isDev: boolean,
 *   isMac: boolean,
 *   send: (command: string, win: unknown) => void,
 *   openAuthorPage: () => void,
 * }} opts
 */
function buildMenuTemplate(lang, { isDev, isMac, send, openAuthorPage }) {
  const L = LABELS[lang] || LABELS.en;

  /** A menu item that forwards an app command to the renderer. */
  const command = (id, accelerator) => ({
    id,
    label: L[id],
    // macOS menus handle key equivalents before the page sees them, so only
    // show (never register) shortcuts on Windows/Linux.
    ...(accelerator && !isMac ? { accelerator, registerAccelerator: false } : {}),
    click: (_item, win) => send(id, win),
  });

  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: L.file,
      submenu: [
        command("open", "Ctrl+O"),
        command("export", "Ctrl+S"),
        { type: "separator" },
        command("close"),
        ...(isMac ? [] : [{ type: "separator" }, { role: "quit", label: L.quit }]),
      ],
    },
    {
      label: L.edit,
      submenu: [
        command("undo", "Ctrl+Z"),
        command("redo", "Ctrl+Y"),
        { type: "separator" },
        { role: "cut", label: L.cut },
        { role: "copy", label: L.copy },
        { role: "paste", label: L.paste },
      ],
    },
    {
      label: L.view,
      submenu: [
        { role: "resetZoom", label: L.resetZoom },
        { role: "zoomIn", label: L.zoomIn },
        { role: "zoomOut", label: L.zoomOut },
        { type: "separator" },
        { role: "togglefullscreen", label: L.fullscreen },
        ...(isDev
          ? [
              { type: "separator" },
              { role: "reload", label: L.reload },
              { role: "toggleDevTools", label: L.devtools },
            ]
          : []),
      ],
    },
    {
      label: L.help,
      submenu: [
        command("shortcuts"),
        command("credits"),
        { type: "separator" },
        { id: "authorPage", label: L.authorPage, click: () => openAuthorPage() },
      ],
    },
  ];
  return template;
}

module.exports = { buildMenuTemplate, LABELS, MENU_COMMANDS };
