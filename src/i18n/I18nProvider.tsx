import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  I18nContext,
  detectLanguage,
  saveLanguage,
  translate,
  type I18n,
  type Lang,
} from "./index";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLanguage);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    saveLanguage(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${translate(lang, "app.name")} — ${translate(lang, "app.badge")}`;
  }, [lang]);

  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (key, params) => translate(lang, key, params) }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
