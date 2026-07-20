export const SUPPORTED_LANGS = ["pl", "fr"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const FALLBACK_LANG: Lang = "pl";
export const DEFAULT_NS = "common";

/** Namespace'y i18next — dokładane wraz z ekstrakcją kolejnych obszarów. */
export const NAMESPACES = [
  "common",
  "auth",
  "konsultacje",
  "platnosci",
  "podopieczny",
  "trener",
  "trenerPlany",
  "trenerPodopieczni",
  "trenerRozwoj",
  "trenerKonsultacje",
  "marka",
] as const;

/** Język i18next → pełny tag BCP-47 do Intl (waluta/daty/liczby). */
export const langToIntlLocale: Record<Lang, string> = {
  pl: "pl-PL",
  fr: "fr-FR",
};

/** BCP-47 (np. z regions.locale "pl-PL") → język i18next ("pl"). */
export function localeToLang(locale: string | null | undefined): Lang | null {
  if (!locale) return null;
  const base = locale.split("-")[0] ?? "";
  return (SUPPORTED_LANGS as readonly string[]).includes(base) ? (base as Lang) : null;
}
