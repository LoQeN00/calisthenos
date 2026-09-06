import type { ConsultationScheduleView } from "@kalisthenos/api-client";

// Cykl z kontraktu, nie ze schematu Drizzle — źródłem zbioru wartości jest BE.
type ConsultationCadence = ConsultationScheduleView["cadence"];

export interface RecurrenceRule {
  cadence: ConsultationCadence;
  /** 0=niedziela..6=sobota — dla weekly/biweekly. */
  weekday: number | null;
  /** 1..28 — dla monthly. */
  dayOfMonth: number | null;
  /** "HH:MM". */
  timeOfDay: string;
  /** Kotwica serii, "YYYY-MM-DD". */
  startsOn: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseHM(time: string): { h: number; m: number } {
  const [h, m] = time.split(":").map((x) => Number(x));
  return { h: h ?? 0, m: m ?? 0 };
}

/** UTC timestamp z dnia (YYYY-MM-DD) i godziny (HH:MM). */
function atUTC(dateISO: string, time: string): Date {
  const { h, m } = parseHM(time);
  const [y, mo, d] = dateISO.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h, m, 0, 0));
}

/**
 * Liczy daty terminów (ISO UTC) z reguły cyklu w oknie [from, from+horizonDays].
 * Czysta funkcja — bez I/O, bez `Date.now()` (kotwica `from` podawana z zewnątrz).
 */
export function nextOccurrences(
  rule: RecurrenceRule,
  opts: { from: string; horizonDays: number },
): string[] {
  const windowStart = atUTC(opts.from, "00:00");
  const windowEnd = new Date(windowStart.getTime() + opts.horizonDays * DAY_MS);
  const out: string[] = [];

  if (rule.cadence === "monthly") {
    const dom = rule.dayOfMonth ?? 1;
    const anchor = atUTC(rule.startsOn, rule.timeOfDay);
    let y = anchor.getUTCFullYear();
    let mo = anchor.getUTCMonth();
    const { h, m } = parseHM(rule.timeOfDay);
    // Iteruj miesiącami od kotwicy do końca okna.
    for (let guard = 0; guard < 400; guard++) {
      const occ = new Date(Date.UTC(y, mo, dom, h, m, 0, 0));
      if (occ.getTime() > windowEnd.getTime()) break;
      if (occ.getTime() >= windowStart.getTime() && occ.getTime() >= anchor.getTime()) {
        out.push(occ.toISOString());
      }
      mo += 1;
      if (mo > 11) {
        mo = 0;
        y += 1;
      }
    }
    return out;
  }

  // weekly / biweekly
  const stepDays = rule.cadence === "biweekly" ? 14 : 7;
  const anchor = atUTC(rule.startsOn, rule.timeOfDay);
  // Pierwsza data >= startsOn o właściwym dniu tygodnia.
  const targetDow = rule.weekday ?? anchor.getUTCDay();
  const delta = (targetDow - anchor.getUTCDay() + 7) % 7;
  const first = new Date(anchor.getTime() + delta * DAY_MS);

  for (let t = first.getTime(); t <= windowEnd.getTime(); t += stepDays * DAY_MS) {
    if (t >= windowStart.getTime()) out.push(new Date(t).toISOString());
  }
  return out;
}
