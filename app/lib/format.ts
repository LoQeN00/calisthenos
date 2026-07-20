function parseDate(iso: string): Date {
  // `iso` is either YYYY-MM-DD (from Postgres `date`) or a full ISO timestamp.
  // The Date constructor handles both, but YYYY-MM-DD is interpreted as UTC midnight
  // which is what we want for date-only values.
  return new Date(iso);
}

/**
 * Formatuje datę ISO jako czytelny string w podanym locale.
 *
 * Domyślnie pl-PL z krótką nazwą miesiąca (np. "5 sty 2026") — wstecznie
 * kompatybilne ze wszystkimi callerami, które wołają fmtDate(iso).
 *
 * Dla innych locale (np. "fr-FR") Intl dobiera lokalny format miesiąca.
 */
export function fmtDate(iso: string, locale = "pl-PL"): string {
  const d = parseDate(iso);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function fmtDateShort(iso: string, locale = "pl-PL"): string {
  const d = parseDate(iso);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(d);
}

// Skrócone nazwy miesięcy PL — używane tylko w fmtDateTime (UTC, stały format).
const MONTH_SHORT_PL = [
  "sty",
  "lut",
  "mar",
  "kwi",
  "maj",
  "cze",
  "lip",
  "sie",
  "wrz",
  "paź",
  "lis",
  "gru",
];

/**
 * Data + godzina w UTC (v1 = jedna strefa aplikacji).
 *
 * Domyślnie pl-PL ze stałym ręcznym formatem ("11 cze 2026, 18:00") — wstecznie
 * kompatybilne ze wszystkimi callerami. Dla innych locale (np. "fr-FR") Intl
 * dobiera lokalny format, wciąż renderując w strefie UTC.
 */
export function fmtDateTime(iso: string, locale = "pl-PL"): string {
  const d = parseDate(iso);
  if (locale === "pl-PL") {
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${d.getUTCDate()} ${MONTH_SHORT_PL[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm}`;
  }
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

/** Sama godzina w UTC. */
export function fmtTime(iso: string): string {
  const d = parseDate(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Czas względny ("wczoraj", "3 dni temu", …) w podanym locale przez
 * `Intl.RelativeTimeFormat`. Domyślnie pl-PL — wstecznie kompatybilne z callerami
 * wołającymi `daysAgo(iso)`. Dla fr-FR Intl zwraca "hier", "il y a 3 jours" itd.
 */
export function daysAgo(iso: string, locale = "pl-PL"): string {
  const d = parseDate(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (diff <= 0) return rtf.format(0, "day");
  if (diff === 1) return rtf.format(-1, "day");
  if (diff < 7) return rtf.format(-diff, "day");
  if (diff < 30) return rtf.format(-Math.floor(diff / 7), "week");
  return rtf.format(-Math.floor(diff / 30), "month");
}

export function todayISO(): string {
  // YYYY-MM-DD in local time
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Zakres miesiąca "YYYY-MM" jako ISO UTC [from, to] + rozbicie na rok/miesiąc(0-idx).
 * Współdzielone przez kalendarze konsultacji (loadery), żeby trener i podopieczny
 * liczyli okno miesiąca identycznie.
 */
export function monthRangeUTC(m: string): {
  fromISO: string;
  toISO: string;
  year: number;
  month0: number;
} {
  const [y, mo] = m.split("-").map((x) => Number(x));
  const year = y ?? 1970;
  const month0 = (mo ?? 1) - 1;
  const from = new Date(Date.UTC(year, month0, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, month0 + 1, 0, 23, 59, 59));
  return { fromISO: from.toISOString(), toISO: to.toISOString(), year, month0 };
}

/** Przesuwa "YYYY-MM" o `delta` miesięcy (do nawigacji ‹ ›). */
export function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map((x) => Number(x));
  const d = new Date(Date.UTC(y ?? 1970, (mo ?? 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Polish noun pluralization. Pass three forms (1 / 2-4 / 5+) — covers all
 * Polish numbers via the `12-14` special-case rule.
 *
 *   pluralizePl(1, { one: "sesja", few: "sesje", many: "sesji" })   // "sesja"
 *   pluralizePl(3, ...)                                              // "sesje"
 *   pluralizePl(13, ...)                                             // "sesji"
 */
export interface PlForms {
  /** Form for n === 1 (e.g. "sesja"). */
  one: string;
  /** Form for n ending in 2-4 except teens (e.g. "sesje"). */
  few: string;
  /** Form for everything else (e.g. "sesji"). */
  many: string;
}

export function pluralizePl(n: number, forms: PlForms): string {
  if (n === 1) return forms.one;
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 12 && lastTwo <= 14) return forms.many;
  if (last >= 2 && last <= 4) return forms.few;
  return forms.many;
}
