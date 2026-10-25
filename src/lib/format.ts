import type { Lang } from "@/i18n";

const locale = (lang: Lang) => (lang === "he" ? "he-IL" : "en-US");

/** Formats integer minor units (cents) as currency, without decimals for whole amounts. */
export function formatMoney(minor: number, currency: string, lang: Lang, compact = false): string {
  const major = minor / 100;
  return new Intl.NumberFormat(locale(lang), {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(major) ? 0 : 2,
    ...(compact ? { notation: "compact" as const } : {}),
  }).format(major);
}

export function formatNumber(n: number, lang: Lang, digits = 0): string {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits }).format(n);
}

export function formatPercent(ratio: number, lang: Lang, digits = 0): string {
  return new Intl.NumberFormat(locale(lang), {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(ratio);
}

/** `2025-03-01` -> "Mar 2025" / "מרץ 2025". Dates are treated as UTC calendar days. */
export function formatMonth(isoDate: string, lang: Lang): string {
  const [y, m] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(locale(lang), { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export function formatDate(isoDate: string, lang: Lang): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(locale(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
