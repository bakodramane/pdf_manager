import { createContext, useContext } from "react";
import { en, type MessageKey, type Messages } from "./en";
import { fr } from "./fr";

export type { MessageKey } from "./en";

export const LANGUAGES = {
  en: { label: "English", short: "EN" },
  fr: { label: "Français", short: "FR" },
} as const;

export type Lang = keyof typeof LANGUAGES;

export const DICTIONARIES: Record<Lang, Messages> = { en, fr };

export type Params = Record<string, string | number>;

/** Look up `key` in `lang` and fill `{placeholder}` tokens from `params`. */
export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  const template = DICTIONARIES[lang][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

const STORAGE_KEY = "pdfm.lang";

function isLang(value: unknown): value is Lang {
  return typeof value === "string" && value in LANGUAGES;
}

/**
 * Pick the starting language, in priority order:
 *  1. the user's explicit choice from a previous session (localStorage);
 *  2. the language chosen in the Windows installer (`?lang=` set by Electron);
 *  3. the operating system / browser language;
 *  4. English.
 */
export function detectLanguage(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    // Storage can be unavailable (private mode, sandboxed file://).
  }
  const fromUrl = new URLSearchParams(window.location.search).get("lang");
  if (isLang(fromUrl)) return fromUrl;
  const preferred = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const tag of preferred) {
    const base = tag?.toLowerCase().split("-")[0];
    if (isLang(base)) return base;
  }
  return "en";
}

export function saveLanguage(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not fatal: the choice simply won't persist.
  }
}

export interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, params?: Params) => string;
}

export const I18nContext = createContext<I18n>({
  lang: "en",
  setLang: () => undefined,
  t: (key, params) => translate("en", key, params),
});

export function useI18n(): I18n {
  return useContext(I18nContext);
}
