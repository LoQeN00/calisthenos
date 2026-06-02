import { Link } from "react-router";
import { Icons } from "~/components/icons";
import { type ConsultationTone, TONE_DOT } from "~/lib/consultation-status";

const WEEKDAY_HEADERS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
const MONTHS_PL = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
];

export interface DaySummary {
  /** Najważniejszy ton dnia (kolor kropki). */
  tone: ConsultationTone;
  /** Liczba terminów tego dnia (>1 → liczba na kropce). */
  count: number;
}

interface MonthCalendarProps {
  year: number;
  /** Miesiąc 0-indeksowany. */
  month0: number;
  /** Dzień miesiąca dla „dziś”, jeśli ten miesiąc jest bieżący — inaczej null. */
  todayDay: number | null;
  /** Podsumowanie per dzień miesiąca (1..31). */
  days: Map<number, DaySummary>;
  selected: number | null;
  onSelect: (day: number) => void;
  prevHref: string;
  nextHref: string;
}

/**
 * Siatka miesiąca konsultacji — JEDEN komponent dla obu ról, więc kalendarz
 * trenera i podopiecznego wyglądają identycznie. Tydzień od poniedziałku, „dziś”
 * jako wypełniony żeton, dni bez terminu nieaktywne. Kolory kropek z tonów.
 */
export function MonthCalendar({
  year,
  month0,
  todayDay,
  days,
  selected,
  onSelect,
  prevHref,
  nextHref,
}: MonthCalendarProps) {
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(year, month0, 1)).getUTCDay(); // 0=Nd
  const leadingBlanks = (firstDow + 6) % 7; // tydzień od poniedziałku

  return (
    <div className="card cal">
      <div className="cal-head">
        <Link to={prevHref} className="btn btn-icon btn-ghost" aria-label="Poprzedni miesiąc">
          <Icons.ChevLeft />
        </Link>
        <div className="cal-title">
          {MONTHS_PL[month0]} {year}
        </div>
        <Link to={nextHref} className="btn btn-icon btn-ghost" aria-label="Następny miesiąc">
          <Icons.Chev />
        </Link>
      </div>
      <div className="cal-grid">
        {WEEKDAY_HEADERS.map((w) => (
          <div key={w} className="cal-dow">
            {w}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: statyczne placeholdery
          <div key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const s = days.get(day);
          const has = s != null;
          const cls = [
            "cal-cell",
            has && "has",
            day === todayDay && "today",
            day === selected && "sel",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={day}
              type="button"
              className={cls}
              disabled={!has}
              aria-pressed={day === selected}
              aria-label={
                has ? `${day} — ${s.count} ${s.count === 1 ? "termin" : "terminy"}` : String(day)
              }
              onClick={() => has && onSelect(day)}
            >
              <span className="cal-day">{day}</span>
              {has ? (
                s.count > 1 ? (
                  <span className="cal-count" style={{ background: TONE_DOT[s.tone] }}>
                    {s.count}
                  </span>
                ) : (
                  <span className="cal-dot" style={{ background: TONE_DOT[s.tone] }} />
                )
              ) : (
                <span className="cal-dot-slot" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
