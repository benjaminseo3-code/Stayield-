import { dictionaries, type DictKey, type Params, type TFn } from "@/i18n";
import type { CheckLevel } from "@/lib/ingest/types";

/** Resolves a check (code + level + params) to a plain-language sentence in the current language. */
export function checkText(t: TFn, c: { code: string; level: CheckLevel; params?: Params }): string {
  const key = `check.${c.code}.${c.level}`;
  if (key in dictionaries.en) return t(key as DictKey, c.params);
  return t("check.unknown", { code: c.code });
}
