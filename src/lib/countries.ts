import type { DictKey, TFn } from "@/i18n";

/** Countries a listing can be in and an investor can target. Stored as ISO 3166-1 alpha-2 codes. */
export const COUNTRIES = ["IL", "CY", "GR"] as const;
export type CountryCode = (typeof COUNTRIES)[number];

export const isCountry = (v: string): v is CountryCode => (COUNTRIES as readonly string[]).includes(v);

/** Parses a stored comma-separated list, dropping anything that is not a supported code. */
export const parseCountries = (v: string): CountryCode[] =>
  v
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(isCountry);

/** Localised name for a code; anything else (older free-text values) is shown as it was written. */
export const countryLabel = (t: TFn, code: string): string => (isCountry(code.toUpperCase()) ? t(`country.${code.toUpperCase()}` as DictKey) : code);
