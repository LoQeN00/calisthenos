import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Icons } from "~/components/icons";
import {
  Heatmap,
  SegmentedBar,
  SegmentedBarLegend,
  type BarSegment,
} from "~/components/stat-widgets";
import { fmtDate } from "~/lib/format";
import type { EffortBalance, HeatmapDay, HeroStats, ThisWeekStats } from "~/lib/stats";

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
      <div className="row between" style={{ alignItems: "baseline", marginBottom: 12 }}>
        <h2 style={{ fontSize: 17 }}>{title}</h2>
        {icon != null && <span style={{ color: "var(--muted)" }}>{icon}</span>}
      </div>
      {children}
    </section>
  );
}

// ============================================================
// HeroStatsCard
// ============================================================

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

export function HeroStatsCard({ hero }: { hero: HeroStats }) {
  const { t } = useTranslation("podopieczny");
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
          label={t("stats.hero.totalSessions")}
          value={hero.totalSessions.toLocaleString("pl-PL")}
          suffix={t("stats.suffixes.sessions", { count: hero.totalSessions })}
        />
        <HeroStat
          label={t("stats.hero.streak")}
          value={hero.streakWeeks.toString()}
          suffix={t("stats.suffixes.weeks", { count: hero.streakWeeks })}
          accent={hero.streakWeeks > 0}
        />
        <HeroStat
          label={t("stats.hero.longestStreak")}
          value={hero.longestStreakWeeks.toString()}
          suffix={t("stats.suffixes.weeks", { count: hero.longestStreakWeeks })}
        />
        <HeroStat
          label={t("stats.hero.journeyDay")}
          value={hero.journeyDayNumber === 0 ? "—" : `#${hero.journeyDayNumber}`}
          suffix={
            hero.firstSessionOn
              ? t("stats.hero.fromDate", { date: fmtDate(hero.firstSessionOn) })
              : t("stats.hero.fromFirstSession")
          }
        />
        <HeroStat
          label={t("stats.hero.totalReps")}
          value={hero.totalReps.toLocaleString("pl-PL")}
          suffix={t("stats.suffixes.reps", { count: hero.totalReps })}
        />
        <HeroStat
          label={t("stats.hero.tensionSeconds")}
          value={hero.totalSecondsUnderTension.toLocaleString("pl-PL")}
          suffix={t("stats.hero.tensionSuffix")}
        />
      </div>
    </div>
  );
}

// ============================================================
// ThisWeekCard
// ============================================================

export function ThisWeekCard({ thisWeek }: { thisWeek: ThisWeekStats }) {
  const { t } = useTranslation("podopieczny");
  const aboveAvg = thisWeek.thisWeek >= thisWeek.avgPerWeek;
  const message =
    thisWeek.avgPerWeek === 0
      ? t("stats.thisWeek.firstTime", { count: thisWeek.thisWeek })
      : aboveAvg
        ? t("stats.thisWeek.aboveAvg", { count: thisWeek.thisWeek, avg: thisWeek.avgPerWeek })
        : t("stats.thisWeek.belowAvg", { count: thisWeek.thisWeek, avg: thisWeek.avgPerWeek });

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
        {t("stats.thisWeek.label")}
      </div>
      <div style={{ fontSize: 14, color: "var(--ink)" }}>{message}</div>
    </div>
  );
}

// ============================================================
// ActivityHeatmapCard
// ============================================================

export function ActivityHeatmapCard({ days }: { days: HeatmapDay[] }) {
  const { t } = useTranslation("podopieczny");
  return (
    <Section title={t("stats.heatmap.title")} icon={<Icons.Calendar />}>
      <Heatmap days={days} />
      <div className="text-xs muted" style={{ marginTop: 8 }}>
        {t("stats.heatmap.subtitle")}
      </div>
    </Section>
  );
}

// ============================================================
// EffortBalanceCard
// ============================================================

export function EffortBalanceCard({ effort }: { effort: EffortBalance }) {
  const { t } = useTranslation("podopieczny");
  if (effort.total === 0) return null;

  const segments: BarSegment[] = [
    { label: t("stats.effort.easy"), value: effort.easy, color: "var(--ok)" },
    { label: t("stats.effort.mid"), value: effort.mid, color: "var(--accent)" },
    { label: t("stats.effort.hard"), value: effort.hard, color: "var(--danger)" },
  ];

  const verdictMsg =
    effort.verdict === "balanced"
      ? t("stats.effort.verdictBalanced")
      : effort.verdict === "too-hard"
        ? t("stats.effort.verdictTooHard")
        : effort.verdict === "too-easy"
          ? t("stats.effort.verdictTooEasy")
          : "";

  return (
    <Section title={t("stats.effort.title")} icon={<Icons.Trend />}>
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
// WrappedListRow
// ============================================================

export function WrappedListRow({
  months,
}: {
  months: Array<{ ym: string; label: string; sessions: number }>;
}) {
  const { t } = useTranslation("podopieczny");
  if (months.length === 0) return null;
  return (
    <Section title={t("stats.wrappedList.title")} icon={<Icons.Sparkle />}>
      <div className="text-xs muted" style={{ marginBottom: 10 }}>
        {t("stats.wrappedList.subtitle")}
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
              {t("stats.wrappedList.label")}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
            <div className="text-xs" style={{ opacity: idx === 0 ? 0.7 : undefined }}>
              {t("stats.wrappedList.sessions", { count: m.sessions })}
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}
