/**
 * Strefa czasowa aplikacji (v1 = jedna strefa dla wszystkich).
 *
 * Konwencja czasu w kalisthenos: godziny trzymamy jako **czas ścienny zapisany w
 * komponentach UTC** — formularze doklejają `Z` do wpisanej godziny, a formattery
 * czytają `getUTC*`. Wewnątrz aplikacji jest to spójne, ale gdy taki czas
 * przekracza granicę do systemu świadomego stref (Google Calendar), trzeba mu
 * podać, w jakiej strefie ten czas ścienny obowiązuje — inaczej zostanie
 * zinterpretowany jako UTC i przesunięty o offset. Strefę podaje jawnie BE
 * przy wypychaniu terminu do kalendarza zewnętrznego.
 */
export const APP_TIME_ZONE = "Europe/Warsaw";

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

function parseDate(iso: string): Date {
  // `iso` is either YYYY-MM-DD (from Postgres `date`) or a full ISO timestamp.
  // The Date constructor handles both, but YYYY-MM-DD is interpreted as UTC midnight
  // which is what we want for date-only values.
  return new Date(iso);
}

export function fmtDate(iso: string): string {
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTH_SHORT_PL[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateShort(iso: string): string {
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTH_SHORT_PL[d.getMonth()]}`;
}

/** Data + godzina w UTC (v1 = jedna strefa aplikacji). */
export function fmtDateTime(iso: string): string {
  const d = parseDate(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTH_SHORT_PL[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm}`;
}

/** Sama godzina w UTC. */
export function fmtTime(iso: string): string {
  const d = parseDate(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function daysAgo(iso: string): string {
  const d = parseDate(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diff < 0) return "dzisiaj";
  if (diff === 0) return "dzisiaj";
  if (diff === 1) return "wczoraj";
  if (diff < 7) return `${diff} dni temu`;
  if (diff < 30) return `${Math.floor(diff / 7)} tyg. temu`;
  return `${Math.floor(diff / 30)} mies. temu`;
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
