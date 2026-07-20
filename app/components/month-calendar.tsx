import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Icons } from "~/components/icons";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { type ConsultationTone, TONE_DOT } from "~/lib/consultation-status";

// Krótkie nagłówki dni tygodnia (Pn..Nd), lokalizowane przez Intl.
function weekdayHeaders(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  // 2024-01-01 to poniedziałek (UTC) — kolejne 7 dni to Pn..Nd.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i))));
}

// Nazwa miesiąca w danym locale (np. "czerwiec" / "juin").
function monthName(year: number, month0: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month0, 1)),
  );
}

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
  const { t, i18n } = useTranslation("konsultacje");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const weekdays = weekdayHeaders(locale);
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(year, month0, 1)).getUTCDay(); // 0=Nd
  const leadingBlanks = (firstDow + 6) % 7; // tydzień od poniedziałku

  return (
    <div className="card cal">
      <div className="cal-head">
        <Link to={prevHref} className="btn btn-icon btn-ghost" aria-label={t("calendar.prevMonth")}>
          <Icons.ChevLeft />
        </Link>
        <div className="cal-title">
          {monthName(year, month0, locale)} {year}
        </div>
        <Link to={nextHref} className="btn btn-icon btn-ghost" aria-label={t("calendar.nextMonth")}>
          <Icons.Chev />
        </Link>
      </div>
      <div className="cal-grid">
        {weekdays.map((w) => (
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
                has
                  ? s.count === 1
                    ? t("calendar.dayAriaOne", { day })
                    : t("calendar.dayAriaMany", { day, count: s.count })
                  : String(day)
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
