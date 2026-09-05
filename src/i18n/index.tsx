import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { en } from "./en";
import { es } from "./es";

export type Lang = "en" | "es";
const dicts: Record<Lang, Record<string, string>> = { en, es };
const LANG_KEY = "macropad-editor-lang";

export type TFunc = (key: string, params?: Record<string, string | number>) => string;

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFunc;
}

const Ctx = createContext<I18nCtx>({ lang: "en", setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      return saved === "es" ? "es" : "en";
    } catch {
      return "en";
    }
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  const t = useCallback<TFunc>(
    (key, params) => {
      let s = dicts[lang][key] ?? dicts.en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
      }
      return s;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
