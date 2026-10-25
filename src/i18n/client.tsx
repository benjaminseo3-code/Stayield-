"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  LANG_COOKIE,
  LANG_STORAGE_KEY,
  dictionaries,
  isLang,
  translate,
  type Lang,
  type TFn,
} from "./index";

type Ctx = { lang: Lang; t: TFn; setLang: (l: Lang) => void };
const LangContext = createContext<Ctx | null>(null);

function persist(lang: Lang) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* storage can be unavailable (private mode, blocked); the cookie still works */
  }
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const router = useRouter();

  // First visit with no cookie: honour a language remembered in localStorage.
  useEffect(() => {
    if (document.cookie.split("; ").some((c) => c.startsWith(`${LANG_COOKIE}=`))) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LANG_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (isLang(stored) && stored !== lang) {
      persist(stored);
      router.refresh();
    }
  }, [lang, router]);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      t: (key, params) => translate(dictionaries[lang], key, params),
      setLang: (next) => {
        persist(next);
        router.refresh();
      },
    }),
    [lang, router],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside <LangProvider>");
  return ctx;
}

export const useT = (): TFn => useLang().t;
