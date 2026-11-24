/**
 * Bridge to the Electron desktop shell. In the browser build nothing here
 * has any effect.
 *
 * - Language: the renderer tells the main process (via the preload's
 *   `window.pdfManager.setLanguage`) so the window menu matches the UI.
 * - Menu commands: the main process dispatches a `pdfmanager:menu` DOM event
 *   *with a user gesture* (webContents.executeJavaScript(code, true)), so
 *   actions such as "Open…" may open the file picker, which browsers only
 *   allow in response to user input.
 */
export const MENU_COMMANDS = [
  "open",
  "export",
  "close",
  "undo",
  "redo",
  "zoomIn",
  "zoomOut",
  "zoomReset",
  "shortcuts",
  "credits",
] as const;

export type MenuCommand = (typeof MENU_COMMANDS)[number];

export const MENU_EVENT = "pdfmanager:menu";

declare global {
  interface Window {
    pdfManager?: { setLanguage(lang: string): void };
  }
}

export function isMenuCommand(value: unknown): value is MenuCommand {
  return typeof value === "string" && (MENU_COMMANDS as readonly string[]).includes(value);
}

export function setDesktopLanguage(lang: string): void {
  window.pdfManager?.setLanguage(lang);
}

/** Subscribe to window-menu commands; returns an unsubscribe function. */
export function onDesktopMenuCommand(callback: (command: MenuCommand) => void): () => void {
  const listener = (e: Event) => {
    const command = (e as CustomEvent<unknown>).detail;
    if (isMenuCommand(command)) callback(command);
  };
  window.addEventListener(MENU_EVENT, listener);
  return () => window.removeEventListener(MENU_EVENT, listener);
}
