import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import {
  Heatmap,
  SegmentedBar,
  SegmentedBarLegend,
  Sparkline,
  type BarSegment,
} from "~/components/stat-widgets";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate, pluralizePl, type PlForms } from "~/lib/format";
import {
  getActivityHeatmap,
  getEasierAtSameReps,
  getEffortBalance,
  getHeroStats,
  getMonthSummary,
  getPersonalRecords,
  getTagDistribution,
  getThisWeekStats,
  getTopExerciseSparklines,
} from "~/lib/stats";
import { getAvailableWrappedMonths } from "~/lib/wrapped";

const SESJA: PlForms = { one: "sesja", few: "sesje", many: "sesji" };
const TYDZIEN: PlForms = { one: "tydzień", few: "tygodnie", many: "tygodni" };
const POWT: PlForms = { one: "powtórzenie", few: "powtórzenia", many: "powtórzeń" };
const PR_FORMS: PlForms = { one: "rekord", few: "rekordy", many: "rekordów" };

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const [
    hero,
    thisWeek,
    prs,
    heatmap,
    sparklines,
    easier,
    monthSummary,
    effort,
    tagDist,
    wrappedMonths,
  ] = await Promise.all([
    getHeroStats(db, user.id),
    getThisWeekStats(db, user.id),
    getPersonalRecords(db, user.id, { limit: 50 }),
    getActivityHeatmap(db, user.id, 26),
    getTopExerciseSparklines(db, user.id, 5),
    getEasierAtSameReps(db, user.id),
    getMonthSummary(db, user.id),
    getEffortBalance(db, user.id),
    getTagDistribution(db, user.id, 30),
    getAvailableWrappedMonths(db, user.id),
  ]);
  return {
    hero,
    thisWeek,
    prs,
    heatmap,
    sparklines,
    easier,
    monthSummary,
    effort,
    tagDist,
    wrappedMonths,
  };
}

export default function TraineeStatystyki() {
  const {
    hero,
    thisWeek,
    prs,
    heatmap,
    sparklines,
    easier,
    monthSummary,
    effort,
    tagDist,
    wrappedMonths,
  } = useLoaderData<typeof loader>();
  const isQuiet = hero.totalSessions === 0;

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny
          </div>
          <h1>Statystyki</h1>
          <div className="sub">
            {isQuiet
              ? "Zarejestruj pierwszą sesję, by zobaczyć swoje liczby."
              : "Twój postęp w jednym miejscu."}
          </div>
        </div>
      </div>

      {isQuiet ? (
        <div className="empty">
          <h3>Brak danych</h3>
          <div>Statystyki pojawią się po pierwszej zarejestrowanej sesji.</div>
        </div>
      ) : (
        <>
          <HeroCard hero={hero} />
          <ThisWeekCard thisWeek={thisWeek} />

          <Section title="Twój rok" icon={<Icons.Calendar />}>
            <Heatmap days={heatmap} />
            <div className="text-xs muted" style={{ marginTop: 8 }}>
              Każdy kwadrat to dzień. Im jaśniej, tym więcej sesji tego dnia.
            </div>
          </Section>

          <MonthCard month={monthSummary} />
          <EffortCard effort={effort} />
          <TagDistributionCard
            shares={tagDist.shares}
            untagged={tagDist.untagged}
            total={tagDist.totalExerciseLogs}
          />

          <SparklineSection sparklines={sparklines} />
          <EasierSection easier={easier} />

          <PRSection prs={prs} />

          <WrappedSection months={wrappedMonths} />
        </>
      )}
    </div>
  );
}

function WrappedSection({
  months,
}: {
  months: ReturnType<typeof useLoaderData<typeof loader>>["wrappedMonths"];
}) {
  if (months.length === 0) return null;
  return (
    <Section title="Twoje wrappedy" icon={<Icons.Sparkle />}>
      <div className="text-xs muted" style={{ marginBottom: 10 }}>
        Każdego 1. dnia miesiąca odblokowuje się retrospektywa poprzedniego.
      </div>
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        {months.map((m, idx) => (
          <Link
            key={m.ym}
            to={`/podopieczny/wrapped/${m.ym}`}
            className="card card-hover"
            style={{
              padding: 14,
              textDecoration: "none",
              display: "block",
              background: idx === 0 ? "var(--ink)" : "var(--surface)",
              color: idx === 0 ? "var(--bg)" : "inherit",
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: ".1em",
                opacity: idx === 0 ? 0.65 : 0.5,
                marginBottom: 6,
              }}
            >
              Wrapped
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              {m.label}
            </div>
            <div
              className="text-xs"
              style={{ opacity: idx === 0 ? 0.7 : undefined }}
            >
              {m.sessions} {m.sessions === 1 ? "sesja" : "sesji"}
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}

// ============================================================
// Hero (extended with longest streak, journey day, seconds under tension)
// ============================================================

function HeroCard({ hero }: { hero: ReturnType<typeof useLoaderData<typeof loader>>["hero"] }) {
  return (
    <div
      className="card"
      style={{
        marginBottom: 20,
        padding: 24,
        background: "var(--ink)",
        color: "var(--bg)",
        border: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: "var(--accent)",
          opacity: 0.15,
          pointerEvents: "none",
        }}
      />
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 20,
          position: "relative",
        }}
      >
        <HeroStat
          label="Sesji łącznie"
          value={hero.totalSessions.toLocaleString("pl-PL")}
          suffix={pluralizePl(hero.totalSessions, SESJA)}
        />
        <HeroStat
          label="Streak"
          value={hero.streakWeeks.toString()}
          suffix={pluralizePl(hero.streakWeeks, TYDZIEN)}
          accent={hero.streakWeeks > 0}
        />
        <HeroStat
          label="Najdłuższy streak"
          value={hero.longestStreakWeeks.toString()}
          suffix={pluralizePl(hero.longestStreakWeeks, TYDZIEN)}
        />
        <HeroStat
          label="Dzień podróży"
          value={hero.journeyDayNumber === 0 ? "—" : `#${hero.journeyDayNumber}`}
          suffix={
            hero.firstSessionOn ? `od ${fmtDate(hero.firstSessionOn)}` : "od pierwszej sesji"
          }
        />
        <HeroStat
          label="Łączne powtórzenia"
          value={hero.totalReps.toLocaleString("pl-PL")}
          suffix={pluralizePl(hero.totalReps, POWT)}
        />
        <HeroStat
          label="Sekund pod tension"
          value={hero.totalSecondsUnderTension.toLocaleString("pl-PL")}
          suffix="ćwiczenia czasowe"
        />
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: string;
  suffix: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".08em",
          opacity: 0.6,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          lineHeight: 1,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: accent ? "var(--accent)" : "var(--bg)",
        }}
      >
        {value}
      </div>
      <div className="mono" style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
        {suffix}
      </div>
    </div>
  );
}

// ============================================================
// This week card
// ============================================================

function ThisWeekCard({
  thisWeek,
}: {
  thisWeek: ReturnType<typeof useLoaderData<typeof loader>>["thisWeek"];
}) {
  const aboveAvg = thisWeek.thisWeek >= thisWeek.avgPerWeek;
  const message =
    thisWeek.avgPerWeek === 0
      ? `${thisWeek.thisWeek} ${pluralizePl(thisWeek.thisWeek, SESJA)} w tym tygodniu — dobry początek!`
      : aboveAvg
        ? `${thisWeek.thisWeek} ${pluralizePl(thisWeek.thisWeek, SESJA)} w tym tygodniu — twoja średnia to ${thisWeek.avgPerWeek}. ✓`
        : `${thisWeek.thisWeek} ${pluralizePl(thisWeek.thisWeek, SESJA)} w tym tygodniu — średnio robisz ${thisWeek.avgPerWeek}. Dasz radę nadrobić?`;

  return (
    <div
      className="card"
      style={{
        marginBottom: 22,
        padding: "16px 20px",
        borderLeft: `3px solid ${aboveAvg ? "var(--ok)" : "var(--accent)"}`,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: ".08em",
          color: "var(--muted)",
          marginBottom: 6,
        }}
      >
        Ten tydzień
      </div>
      <div style={{ fontSize: 14, color: "var(--ink)" }}>{message}</div>
    </div>
  );
}

// ============================================================
// Section wrapper
// ============================================================

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 26 }}>
      <div
        className="row between"
        style={{ alignItems: "baseline", marginBottom: 12 }}
      >
        <h2 style={{ fontSize: 17 }}>{title}</h2>
        {icon != null && <span style={{ color: "var(--muted)" }}>{icon}</span>}
      </div>
      {children}
    </section>
  );
}

// ============================================================
// Month summary card
// ============================================================

function MonthCard({
  month,
}: {
  month: ReturnType<typeof useLoaderData<typeof loader>>["monthSummary"];
}) {
  return (
    <Section title={`Ten miesiąc — ${month.monthLabel}`} icon={<Icons.Calendar />}>
      <div
        className="card"
        style={{ padding: 18, display: "grid", gap: 12 }}
      >
        <div
          className="row wrap"
          style={{ gap: 24, alignItems: "flex-end" }}
        >
          <Stat label="Sesji" value={String(month.sessions)} />
          <Stat
            label={`Pobite ${pluralizePl(month.prsThisMonth, PR_FORMS)}`}
            value={String(month.prsThisMonth)}
            accent={month.prsThisMonth > 0}
          />
          <div style={{ flex: 1, minWidth: 160 }}>
            <div
              className="mono muted"
              style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}
            >
              Top ćwiczenie
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>
              {month.topExerciseName ?? "—"}
            </div>
            {month.topExerciseSessions > 0 && (
              <div className="text-xs muted" style={{ marginTop: 2 }}>
                w {month.topExerciseSessions} {pluralizePl(month.topExerciseSessions, SESJA)}
              </div>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className="mono muted"
        style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 24,
          fontWeight: 600,
          marginTop: 4,
          color: accent ? "var(--ok)" : "var(--ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ============================================================
// Effort balance card
// ============================================================

function EffortCard({
  effort,
}: {
  effort: ReturnType<typeof useLoaderData<typeof loader>>["effort"];
}) {
  if (effort.total === 0) return null;

  const segments: BarSegment[] = [
    { label: "Lekkie (RPE ≤ 4)", value: effort.easy, color: "var(--ok)" },
    { label: "Umiarkowane (5-7)", value: effort.mid, color: "var(--accent)" },
    { label: "Ciężkie (≥ 8)", value: effort.hard, color: "var(--danger)" },
  ];

  const verdictMsg =
    effort.verdict === "balanced"
      ? "Trenujesz mądrze — różnorodność intensywności."
      : effort.verdict === "too-hard"
        ? "Większość sesji była ciężka. Może warto czasem zwolnić."
        : effort.verdict === "too-easy"
          ? "Większość sesji była lekka. Próbujesz przesunąć granicę?"
          : "";

  return (
    <Section title="Balans intensywności (30 dni)" icon={<Icons.Trend />}>
      <div className="card" style={{ padding: 18 }}>
        <SegmentedBar segments={segments} height={12} />
        <SegmentedBarLegend segments={segments} />
        {verdictMsg && (
          <div className="text-xs muted" style={{ marginTop: 10, fontStyle: "italic" }}>
            {verdictMsg}
          </div>
        )}
      </div>
    </Section>
  );
}

// ============================================================
// Tag distribution
// ============================================================

function TagDistributionCard({
  shares,
  untagged,
  total,
}: {
  shares: Array<{ tag: string; count: number; pct: number }>;
  untagged: number;
  total: number;
}) {
  if (total === 0) return null;
  const PALETTE = ["var(--accent)", "var(--ok)", "var(--warn)", "var(--danger)", "var(--muted)"];
  const segments: BarSegment[] = shares.map((s, i) => ({
    label: s.tag,
    value: s.count,
    color: PALETTE[i % PALETTE.length]!,
  }));
  if (untagged > 0) {
    segments.push({ label: "bez kategorii", value: untagged, color: "var(--surface-2)" });
  }

  return (
    <Section title="Rozkład kategorii (30 dni)" icon={<Icons.Filter />}>
      <div className="card" style={{ padding: 18 }}>
        {shares.length === 0 && untagged > 0 ? (
          <div className="text-xs muted">
            Twoje ćwiczenia nie mają jeszcze tagów — trener może je dodać w bibliotece.
          </div>
        ) : (
          <>
            <SegmentedBar segments={segments} height={12} />
            <SegmentedBarLegend segments={segments} />
          </>
        )}
      </div>
    </Section>
  );
}

// ============================================================
// Sparkline section — top 5 exercises by usage
// ============================================================

function SparklineSection({
  sparklines,
}: {
  sparklines: ReturnType<typeof useLoaderData<typeof loader>>["sparklines"];
}) {
  if (sparklines.length === 0) return null;
  return (
    <Section title="Progresja ulubionych ćwiczeń" icon={<Icons.Chart />}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {sparklines.map((s) => (
          <div key={s.exerciseId} className="card" style={{ padding: 14 }}>
            <div
              className="row between"
              style={{ alignItems: "flex-start", marginBottom: 8, gap: 8 }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{s.exerciseName}</div>
                <div className="text-xs muted" style={{ marginTop: 2 }}>
                  {s.points.length} {pluralizePl(s.points.length, SESJA)} ·{" "}
                  PR <span className="mono">{s.pr}</span>
                </div>
              </div>
              <span className={`badge${s.unit === "REPS" ? " active" : ""}`}>{s.unit}</span>
            </div>
            <Sparkline values={s.points.map((p) => p.avgReps)} width={232} height={36} />
            <div
              className="row between"
              style={{ marginTop: 4, fontSize: 11 }}
            >
              <span className="mono muted">{fmtDate(s.points[0]!.performedOn)}</span>
              <span className="mono">
                {s.points[0]!.avgReps} → {s.points[s.points.length - 1]!.avgReps}
              </span>
              <span className="mono muted">
                {fmtDate(s.points[s.points.length - 1]!.performedOn)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ============================================================
// "Easier at same reps" detector
// ============================================================

function EasierSection({
  easier,
}: {
  easier: ReturnType<typeof useLoaderData<typeof loader>>["easier"];
}) {
  if (easier.length === 0) return null;
  return (
    <Section title="Łatwiej Ci niż kiedyś" icon={<Icons.Sparkle />}>
      <div className="card" style={{ padding: 14 }}>
        <div className="text-xs muted" style={{ marginBottom: 10 }}>
          Te ćwiczenia robisz w tej samej liczbie powtórzeń, ale dużo lżej niż wcześniej.
        </div>
        <div className="col" style={{ gap: 10 }}>
          {easier.map((e) => (
            <div
              key={e.exerciseId}
              className="row between"
              style={{
                gap: 10,
                padding: "8px 10px",
                background: "var(--accent-soft)",
                borderRadius: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{e.exerciseName}</div>
                <div className="text-xs muted" style={{ marginTop: 2 }}>
                  {e.reps} {e.unit === "SEC" ? "sek." : "powt."} ·{" "}
                  {fmtDate(e.priorDate)} → {fmtDate(e.recentDate)}
                </div>
              </div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                RPE {e.priorRpe} → {e.recentRpe}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ============================================================
// PRs
// ============================================================

function PRSection({
  prs,
}: {
  prs: ReturnType<typeof useLoaderData<typeof loader>>["prs"];
}) {
  return (
    <Section title="Rekordy osobiste" icon={<Icons.Trophy />}>
      {prs.length === 0 ? (
        <div className="empty">
          <h3>Brak rekordów</h3>
          <div>Po pierwszej serii każde wykonanie ćwiczenia tworzy rekord.</div>
        </div>
      ) : (
        <div className="list">
          <div
            className="list-head"
            style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px 90px", gap: 14 }}
          >
            <div>Ćwiczenie</div>
            <div>Rekord</div>
            <div>Data</div>
            <div />
          </div>
          {prs.map((pr) => (
            <div
              key={pr.exerciseId}
              className="list-row"
              style={{ gridTemplateColumns: "1fr 80px 100px 90px", gap: 14 }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{pr.exerciseName}</div>
                <div className="text-xs muted" style={{ marginTop: 2 }}>
                  {pr.unit === "SEC" ? "wytrzymałość" : "powtórzenia"}
                </div>
              </div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
                {pr.pr}
                <span
                  className="muted"
                  style={{ fontSize: 11, fontWeight: 400, marginLeft: 3 }}
                >
                  {pr.unit === "SEC" ? "s" : "rep"}
                </span>
              </div>
              <div className="mono text-xs muted">{fmtDate(pr.prAchievedOn)}</div>
              <div style={{ textAlign: "right" }}>
                {pr.isFresh && (
                  <span
                    className="badge"
                    style={{
                      background: "var(--accent-soft)",
                      color: "var(--accent-ink)",
                      borderColor: "transparent",
                    }}
                    title="Świeży rekord (ostatnie 7 dni)"
                  >
                    świeży
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
