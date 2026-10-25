import { getT } from "@/i18n/server";
import { checkText } from "@/lib/check-text";
import type { Check } from "@/lib/ingest/types";

const MARK = { pass: "✓", warn: "!", fail: "✕" } as const;

export async function ChecksList({ checks, hidePass = false }: { checks: Check[]; hidePass?: boolean }) {
  const { t } = await getT();
  const shown = hidePass ? checks.filter((c) => c.level !== "pass") : checks;
  return (
    <ul className="check-list">
      {shown.map((c, i) => (
        <li key={`${c.code}-${i}`} data-level={c.level}>
          <span className={`dot ${c.level}`} aria-hidden="true">
            {MARK[c.level]}
          </span>
          <span>
            <span className="visually-hidden">{t(`check.${c.level}`)}: </span>
            {checkText(t, c)}
          </span>
        </li>
      ))}
    </ul>
  );
}
