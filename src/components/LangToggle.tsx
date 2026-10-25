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
      aria-label={t("lang.toggleLabel")}
      lang={next}
    >
      {t("lang.toggle")}
    </button>
  );
}
