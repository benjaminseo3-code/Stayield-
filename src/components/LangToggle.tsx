"use client";

import { useLang } from "@/i18n/client";

export function LangToggle({ className = "btn btn-ghost sm" }: { className?: string }) {
  const { lang, t, setLang } = useLang();
  const next = lang === "he" ? "en" : "he";
  return (
    <button
      type="button"
      className={className}
      onClick={() => setLang(next)}
      // The visible text (the other language's own name) is the accessible name; `lang` makes it read correctly.
      lang={next}
      title={t("lang.toggleLabel")}
    >
      {t("lang.toggle")}
    </button>
  );
}
