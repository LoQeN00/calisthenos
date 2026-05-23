const MONTH_SHORT_PL = [
  "sty", "lut", "mar", "kwi", "maj", "cze",
  "lip", "sie", "wrz", "paź", "lis", "gru",
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
