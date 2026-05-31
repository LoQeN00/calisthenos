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
