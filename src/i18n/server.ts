import "server-only";
import { cookies, headers } from "next/headers";
import { LANG_COOKIE, detectLang, dirOf, isLang, makeT, type Lang } from "./index";

export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(c)) return c;
  return detectLang((await headers()).get("accept-language"));
}

export async function getT() {
  const lang = await getLang();
  return { lang, dir: dirOf(lang), t: makeT(lang) };
}
