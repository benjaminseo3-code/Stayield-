import { en, type DictKey } from "./en";
import { he } from "./he";

export type Lang = "en" | "he";
export const LANGS: readonly Lang[] = ["en", "he"] as const;
export const LANG_COOKIE = "lang";
export const LANG_STORAGE_KEY = "stayield.lang";

export type { DictKey };
export type Dict = Record<DictKey, string>;
export const dictionaries: Record<Lang, Dict> = { en, he };

export const dirOf = (lang: Lang): "ltr" | "rtl" => (lang === "he" ? "rtl" : "ltr");

export const isLang = (v: unknown): v is Lang => v === "en" || v === "he";

/** Default language: Hebrew if the browser prefers Hebrew, otherwise English. */
export function detectLang(acceptLanguage: string | null | undefined): Lang {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("he") || first.startsWith("iw") ? "he" : "en";
}

export type Params = Record<string, string | number>;

export function translate(dict: Dict, key: DictKey, params?: Params): string {
  let s = dict[key];
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export type TFn = (key: DictKey, params?: Params) => string;
export const makeT =
  (lang: Lang): TFn =>
  (key, params) =>
    translate(dictionaries[lang], key, params);
