import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Icons } from "~/components/icons";
import {
  Heatmap,
  SegmentedBar,
  SegmentedBarLegend,
  type BarSegment,
} from "~/components/stat-widgets";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { daysAgo } from "~/lib/format";
import type {
  BodyPhotoCoverage,
  CurrentPlanTotals,
  HeatmapDay,
  HealthStats,
  PlateauExercise,
  PlanSessionUsage,
  TagShare,
  VideoCoverage,
} from "~/lib/stats";

// ============================================================
// Local helpers
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
      <div className="row between" style={{ alignItems: "baseline", marginBottom: 12 }}>
        <h2 style={{ fontSize: 17 }}>{title}</h2>
        {icon != null && <span style={{ color: "var(--muted)" }}>{icon}</span>}
      </div>
      {children}
    </section>
  );
}

function trendArrow(trend: HealthStats["rpeTrend"]): string {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  return "→";
}

function isoFromDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ============================================================
// HealthTilesCard
// ============================================================

function Tile({
  label,
  valueLine,
  sub,
  tone,
}: {
  label: string;
  valueLine: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
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
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1.1,
          color: tone,
        }}
      >
        {valueLine}
      </div>
      <div className="text-xs muted" style={{ marginTop: 6 }}>
        {sub}
      </div>
    </div>
  );
}

export function HealthTilesCard({ health }: { health: HealthStats }) {
  const { t, i18n } = useTranslation();
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const activityTone =
    health.daysSinceLastSession == null
      ? "var(--muted)"
      : health.daysSinceLastSession <= 7 && health.sessionsLast7 >= 2
        ? "var(--ok)"
        : health.daysSinceLastSession <= 14
          ? "var(--warn)"
          : "var(--danger)";

  const rpeTone =
    health.rpeTrend === "up"
      ? "var(--danger)"
      : health.rpeTrend === "down"
        ? "var(--ok)"
        : "var(--muted)";

  const redTone =
    health.redZonePct > 40
      ? "var(--danger)"
      : health.redZonePct < 5 && health.hasAnyLog30d
        ? "var(--warn)"
        : "var(--ink)";

  const adTone = health.allDonePct < 70 && health.hasAnyLog30d ? "var(--warn)" : "var(--ink)";

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        gap: 14,
        marginBottom: 28,
      }}
    >
      <Tile
        label={t("health.tile.activity")}
        valueLine={
          health.daysSinceLastSession == null
            ? t("health.tile.noSessions")
            : daysAgo(isoFromDaysAgo(health.daysSinceLastSession), locale)
        }
        sub={
          health.avgIntervalDays != null
            ? `7d: ${health.sessionsLast7} · 30d: ${health.sessionsLast30} · ${t(
                "health.tile.interval",
                { count: health.avgIntervalDays },
              )}`
            : `7d: ${health.sessionsLast7} · 30d: ${health.sessionsLast30}`
        }
        tone={activityTone}
      />
      <Tile
        label={t("health.tile.avgRpe")}
        valueLine={health.recentAvgRpe === 0 ? "—" : `${health.recentAvgRpe}/10`}
        sub={
          health.historicalAvgRpe === 0
            ? t("health.tile.lastSessions")
            : t("health.tile.vsHistorical", {
                value: health.historicalAvgRpe,
                arrow: trendArrow(health.rpeTrend),
              })
        }
        tone={rpeTone}
      />
      <Tile
        label={t("health.tile.redZone")}
        valueLine={health.hasAnyLog30d ? `${health.redZonePct}%` : "—"}
        sub={
          !health.hasAnyLog30d
            ? t("health.tile.noSessions30d")
            : health.redZonePct > 40
              ? t("health.tile.tooHard")
              : health.redZonePct < 5
                ? t("health.tile.tooLight")
                : t("health.tile.redZoneSub")
        }
        tone={redTone}
      />
      <Tile
        label={t("health.tile.allDone")}
        valueLine={health.hasAnyLog30d ? `${health.allDonePct}%` : "—"}
        sub={health.hasAnyLog30d ? t("health.tile.sessions30d") : t("health.tile.noSessions30d")}
        tone={adTone}
      />
    </div>
  );
}

// ============================================================
// PlateauCard
// ============================================================

export function PlateauCard({ plateau }: { plateau: PlateauExercise[] }) {
  const { t } = useTranslation();
  if (plateau.length === 0) return null;
  return (
    <Section title={t("health.plateau.title")} icon={<Icons.Sparkle />}>
      <div className="card" style={{ padding: 14 }}>
        <div className="text-xs muted" style={{ marginBottom: 10 }}>
          {t("health.plateau.intro")}
        </div>
        <div className="col" style={{ gap: 8 }}>
          {plateau.map((p) => (
            <div
              key={p.exerciseId}
              className="row between"
              style={{
                gap: 10,
                padding: "8px 12px",
                background: "var(--surface)",
                border: "1px solid var(--warn)",
                borderRadius: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{p.exerciseName}</div>
                <div className="text-xs muted" style={{ marginTop: 2 }}>
                  {t("health.plateau.observation", { sessions: p.sessionsConsidered })}{" "}
                  <span className="mono">{p.pr}</span> · {p.unit}
                </div>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <div style={{ textAlign: "right" }}>
                  <div className="mono muted text-xs">{t("health.plateau.avgReps")}</div>
                  <div className="mono" style={{ fontWeight: 600 }}>
                    {p.recentAvgReps}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono muted text-xs">{t("health.plateau.avgRpe")}</div>
                  <div className="mono" style={{ fontWeight: 600, color: "var(--warn)" }}>
                    {p.recentAvgRpe}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ============================================================
// PlanUsageCard
// ============================================================

function PlanRow({ label, value, locale }: { label: string; value: number; locale: string }) {
  return (
    <div className="row between" style={{ fontSize: 13 }}>
      <span className="muted">{label}</span>
      <span className="mono" style={{ fontWeight: 600 }}>
        {value.toLocaleString(locale)}
      </span>
    </div>
  );
}

export function PlanUsageCard({
  usage,
  totals,
}: {
  usage: { planName: string | null; sessions: PlanSessionUsage[] };
  totals: CurrentPlanTotals;
}) {
  const { t, i18n } = useTranslation();
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  if (!usage.planName && !totals.planName) return null;
  return (
    <Section
      title={
        totals.planName
          ? t("health.plan.activeNamed", { name: totals.planName })
          : t("health.plan.active")
      }
      icon={<Icons.Plans />}
    >
      <div className="grid" style={{ gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: ".08em",
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            {t("health.plan.sessionUsage")}
          </div>
          {usage.sessions.length === 0 ? (
            <div className="text-xs muted">{t("health.plan.noSessions")}</div>
          ) : (
            <div className="col" style={{ gap: 6 }}>
              {usage.sessions.map((s) => (
                <div key={s.sessionId} className="row" style={{ gap: 10, alignItems: "center" }}>
                  <span
                    className="mono muted"
                    style={{ fontSize: 11, width: 24, textAlign: "right" }}
                  >
                    #{String(s.ordinal + 1).padStart(2, "0")}
                  </span>
                  <div style={{ flex: 1, fontSize: 13 }}>{s.sessionName}</div>
                  <span
                    className="mono"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: s.doneCount === 0 ? "var(--muted)" : "var(--ink)",
                    }}
                  >
                    ×{s.doneCount}
                  </span>
                  <span className="mono text-xs muted" style={{ minWidth: 80, textAlign: "right" }}>
                    {s.lastPerformedOn ? daysAgo(s.lastPerformedOn, locale) : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: ".08em",
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            {t("health.plan.totalOnPlan")}
          </div>
          <div className="col" style={{ gap: 6 }}>
            <PlanRow
              label={t("health.plan.sessions")}
              value={totals.totalSessionsOnPlan}
              locale={locale}
            />
            <PlanRow label={t("health.plan.sets")} value={totals.totalSets} locale={locale} />
            <PlanRow label={t("health.plan.reps")} value={totals.totalReps} locale={locale} />
            {totals.totalSeconds > 0 && (
              <PlanRow
                label={t("health.plan.secondsUnderTension")}
                value={totals.totalSeconds}
                locale={locale}
              />
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

// ============================================================
// CoverageCard
// ============================================================

function ViewChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className="badge"
      style={{
        background: on ? "var(--accent-soft)" : "var(--surface-2)",
        color: on ? "var(--accent-ink)" : "var(--muted)",
        borderColor: "transparent",
      }}
    >
      {on ? <Icons.Check /> : <Icons.X />} {label}
    </span>
  );
}

export function CoverageCard({
  video,
  photos,
  traineeId,
}: {
  video: VideoCoverage;
  photos: BodyPhotoCoverage;
  traineeId: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  return (
    <Section title={t("health.coverage.title")} icon={<Icons.Camera />}>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="card" style={{ padding: 14 }}>
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
            {t("health.coverage.setVideo")}
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
            {video.total === 0 ? "—" : `${video.pct}%`}
          </div>
          <div className="text-xs muted" style={{ marginTop: 4 }}>
            {video.total === 0
              ? t("health.coverage.noSets30d")
              : t("health.coverage.setsWithVideo", {
                  withVideo: video.withVideo,
                  total: video.total,
                })}
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="row between" style={{ alignItems: "flex-start", marginBottom: 6 }}>
            <div
              className="mono"
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: ".08em",
                color: "var(--muted)",
              }}
            >
              {t("health.coverage.physique")}
            </div>
            <Link
              to={`/trener/podopieczni/${traineeId}/sylwetka`}
              className="text-xs"
              style={{ color: "var(--muted)" }}
            >
              {t("health.coverage.see")} <Icons.Chev />
            </Link>
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
            {photos.daysSinceLast == null
              ? "—"
              : daysAgo(isoFromDaysAgo(photos.daysSinceLast), locale)}
          </div>
          <div className="text-xs muted" style={{ marginTop: 4 }}>
            {t("health.coverage.lastPhoto", { count: photos.totalPhotos })}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            <ViewChip label={t("health.coverage.front")} on={photos.views.front} />
            <ViewChip label={t("health.coverage.side")} on={photos.views.side} />
            <ViewChip label={t("health.coverage.back")} on={photos.views.back} />
          </div>
        </div>
      </div>
    </Section>
  );
}

// ============================================================
// TagDistributionCard
// ============================================================

export function TagDistributionCard({
  shares,
  untagged,
  total,
}: {
  shares: TagShare[];
  untagged: number;
  total: number;
}) {
  const { t } = useTranslation();
  if (total === 0) return null;
  const PALETTE = ["var(--accent)", "var(--ok)", "var(--warn)", "var(--danger)", "var(--muted)"];
  const segments: BarSegment[] = shares.map((s, i) => ({
    label: s.tag,
    value: s.count,
    color: PALETTE[i % PALETTE.length]!,
  }));
  if (untagged > 0) {
    segments.push({
      label: t("health.tags.untagged"),
      value: untagged,
      color: "var(--surface-2)",
    });
  }
  return (
    <Section title={t("health.tags.title")} icon={<Icons.Filter />}>
      <div className="card" style={{ padding: 14 }}>
        {shares.length === 0 && untagged > 0 ? (
          <div className="text-xs muted">{t("health.tags.noTags")}</div>
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
// ActivityHeatmapCard (trainer variant)
// ============================================================

export function ActivityHeatmapCard({ days }: { days: HeatmapDay[] }) {
  const { t } = useTranslation();
  return (
    <Section title={t("health.activity.title")} icon={<Icons.Calendar />}>
      <div className="card" style={{ padding: 14 }}>
        <Heatmap days={days} />
      </div>
    </Section>
  );
}
