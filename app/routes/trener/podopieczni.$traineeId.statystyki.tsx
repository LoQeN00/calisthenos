import { and, eq } from "drizzle-orm";
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
import * as schema from "~/lib/db/schema";
import { daysAgo, fmtDate, pluralizePl, type PlForms } from "~/lib/format";
import {
  getActivePlanSessionUsage,
  getActivityHeatmap,
  getBodyPhotoCoverage,
  getCurrentPlanTotals,
  getExerciseProgress,
  getHealthStats,
  getPersonalRecords,
  getPlateauExercises,
  getTagDistribution,
  getTopExerciseSparklines,
  getVideoCoverage,
  type ExerciseProgress,
  type HealthStats,
} from "~/lib/stats";

const SESJA: PlForms = { one: "sesja", few: "sesje", many: "sesji" };

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";

  const traineeRows = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, user.id),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  const trainee = traineeRows[0];
  if (!trainee) throw new Response("not found", { status: 404 });

  const [
    health,
    progress,
    prs,
    heatmap,
    plateau,
    sparklines,
    planUsage,
    planTotals,
    tagDist,
    videoCov,
    photoCov,
  ] = await Promise.all([
    getHealthStats(db, traineeId),
    getExerciseProgress(db, traineeId),
    getPersonalRecords(db, traineeId, { limit: 100 }),
    getActivityHeatmap(db, traineeId, 12),
    getPlateauExercises(db, traineeId),
    getTopExerciseSparklines(db, traineeId, 5),
    getActivePlanSessionUsage(db, traineeId),
    getCurrentPlanTotals(db, traineeId),
    getTagDistribution(db, traineeId, 30),
    getVideoCoverage(db, traineeId, 30),
    getBodyPhotoCoverage(db, traineeId),
  ]);

  return {
    trainee,
    health,
    progress,
    prs,
    heatmap,
    plateau,
    sparklines,
    planUsage,
    planTotals,
    tagDist,
    videoCov,
    photoCov,
  };
}

export default function TrenerStatystyki() {
  const {
    trainee,
    health,
    progress,
    prs,
    heatmap,
    plateau,
    sparklines,
    planUsage,
    planTotals,
    tagDist,
    videoCov,
    photoCov,
  } = useLoaderData<typeof loader>();
  const hasAnyData = progress.length > 0 || prs.length > 0;

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <span className="current">Statystyki</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {trainee.displayName}
          </div>
          <h1>Statystyki</h1>
          <div className="sub">Aktywność, intensywność, progresja i balans.</div>
        </div>
      </div>

      {!hasAnyData ? (
        <div className="empty">
          <h3>Brak danych</h3>
          <div>Podopieczny jeszcze nic nie zarejestrował.</div>
        </div>
      ) : (
        <>
          <HealthTiles health={health} />

          <Section title="Aktywność (12 tyg.)" icon={<Icons.Calendar />}>
            <div className="card" style={{ padding: 14 }}>
              <Heatmap days={heatmap} />
            </div>
          </Section>

          <ProgressSummary progress={progress} plateau={plateau} />
          <ExerciseProgressTable progress={progress} />

          {plateau.length > 0 && <PlateauSection plateau={plateau} />}

          {sparklines.length > 0 && (
            <Section title="Trendy ulubionych ćwiczeń" icon={<Icons.Chart />}>
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
                          {s.points.length} wykonań · PR <span className="mono">{s.pr}</span>
                        </div>
                      </div>
                      <span className={`badge${s.unit === "REPS" ? " active" : ""}`}>{s.unit}</span>
                    </div>
                    <Sparkline values={s.points.map((p) => p.avgReps)} width={232} height={36} />
                    <div className="row between" style={{ marginTop: 4, fontSize: 11 }}>
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
          )}

          <PlanSection usage={planUsage} totals={planTotals} />
          <TagDistributionSection
            shares={tagDist.shares}
            untagged={tagDist.untagged}
            total={tagDist.totalExerciseLogs}
          />
          <CoverageSection video={videoCov} photos={photoCov} trainee={trainee} />

          {prs.length > 0 && (
            <Section title="Rekordy osobiste" icon={<Icons.Trophy />}>
              <PRMiniList prs={prs} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

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
// Health check tiles
// ============================================================

function HealthTiles({ health }: { health: HealthStats }) {
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
        label="Aktywność"
        valueLine={
          health.daysSinceLastSession == null
            ? "brak sesji"
            : daysAgo(isoFromDaysAgo(health.daysSinceLastSession))
        }
        sub={
          health.avgIntervalDays != null
            ? `7d: ${health.sessionsLast7} · 30d: ${health.sessionsLast30} · co ~${health.avgIntervalDays} dni`
            : `7d: ${health.sessionsLast7} · 30d: ${health.sessionsLast30}`
        }
        tone={activityTone}
      />
      <Tile
        label="Średnie RPE"
        valueLine={health.recentAvgRpe === 0 ? "—" : `${health.recentAvgRpe}/10`}
        sub={
          health.historicalAvgRpe === 0
            ? "ostatnich 5 sesji"
            : `vs ${health.historicalAvgRpe} historycznie ${trendArrow(health.rpeTrend)}`
        }
        tone={rpeTone}
      />
      <Tile
        label="Czerwona strefa"
        valueLine={health.hasAnyLog30d ? `${health.redZonePct}%` : "—"}
        sub={
          !health.hasAnyLog30d
            ? "brak sesji w 30 dni"
            : health.redZonePct > 40
              ? "plan może być za ostry"
              : health.redZonePct < 5
                ? "plan może być za lekki"
                : "RPE 9–10, 30 dni"
        }
        tone={redTone}
      />
      <Tile
        label="Ukończone w całości"
        valueLine={health.hasAnyLog30d ? `${health.allDonePct}%` : "—"}
        sub={health.hasAnyLog30d ? "sesji w 30 dni" : "brak sesji w 30 dni"}
        tone={adTone}
      />
    </div>
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

// ============================================================
// Progress summary (3 mini-cards over the exercises table)
// ============================================================

function ProgressSummary({
  progress,
  plateau,
}: {
  progress: ExerciseProgress[];
  plateau: ReturnType<typeof useLoaderData<typeof loader>>["plateau"];
}) {
  const up = progress.filter((p) => p.status === "up").length;
  const flat = progress.filter((p) => p.status === "flat").length;
  const down = progress.filter((p) => p.status === "down").length;
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 14,
        marginBottom: 14,
      }}
    >
      <MiniCard label="Rośnie" value={up} tone="var(--ok)" icon={<Icons.Trend />} />
      <MiniCard label="Stoi" value={flat} tone="var(--muted)" />
      <MiniCard
        label="Cofa się"
        value={down}
        tone={down > 0 ? "var(--danger)" : "var(--muted)"}
        icon={<Icons.TrendDown />}
      />
      <MiniCard
        label="Plateau"
        value={plateau.length}
        tone={plateau.length > 0 ? "var(--warn)" : "var(--muted)"}
        icon={<Icons.Sparkle />}
      />
    </div>
  );
}

function MiniCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: "12px 14px" }}>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        {icon && <span style={{ color: tone }}>{icon}</span>}
        <div
          className="mono"
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            color: "var(--muted)",
          }}
        >
          {label}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: tone, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

// ============================================================
// Exercise progress table
// ============================================================

function ExerciseProgressTable({ progress }: { progress: ExerciseProgress[] }) {
  if (progress.length === 0) return null;
  return (
    <Section title="Ćwiczenia" icon={<span className="text-xs muted">cofa się najpierw</span>}>
      <div className="list">
        <div
          className="list-head"
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 90px 110px 110px 110px",
            gap: 14,
          }}
        >
          <div>Ćwiczenie</div>
          <div>PR</div>
          <div>Data PR</div>
          <div>Śr. (4 ost.)</div>
          <div>Status</div>
        </div>
        {progress.map((p) => (
          <div
            key={p.exerciseId}
            className="list-row"
            style={{
              gridTemplateColumns: "1.4fr 90px 110px 110px 110px",
              gap: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{p.exerciseName}</div>
              <div className="text-xs muted" style={{ marginTop: 2 }}>
                {p.sessionCount} wykonań · {p.unit}
              </div>
            </div>
            <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
              {p.pr}
              <span className="muted" style={{ fontSize: 10, fontWeight: 400, marginLeft: 3 }}>
                {p.unit === "SEC" ? "s" : "rep"}
              </span>
            </div>
            <div className="mono text-xs muted">{fmtDate(p.prAchievedOn)}</div>
            <div className="mono text-sm">
              {p.recentAvgReps}
              {p.deltaPct != null && (
                <span className="text-xs muted" style={{ marginLeft: 6, fontWeight: 400 }}>
                  {p.deltaPct > 0 ? "+" : ""}
                  {p.deltaPct}%
                </span>
              )}
            </div>
            <div>
              <StatusBadge status={p.status} />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function StatusBadge({ status }: { status: ExerciseProgress["status"] }) {
  if (status === "up") {
    return (
      <span className="badge active">
        <Icons.Trend /> rośnie
      </span>
    );
  }
  if (status === "down") {
    return (
      <span
        className="badge"
        style={{
          background: "rgba(226, 92, 58, 0.08)",
          borderColor: "var(--danger)",
          color: "var(--danger)",
        }}
      >
        <Icons.TrendDown /> cofa się
      </span>
    );
  }
  if (status === "new") {
    return (
      <span className="badge">
        <Icons.Sparkle /> nowe
      </span>
    );
  }
  return (
    <span className="badge" style={{ color: "var(--muted)" }}>
      → stoi
    </span>
  );
}

// ============================================================
// Plateau detector
// ============================================================

function PlateauSection({
  plateau,
}: {
  plateau: ReturnType<typeof useLoaderData<typeof loader>>["plateau"];
}) {
  return (
    <Section title="Plateau — uważne oko" icon={<Icons.Sparkle />}>
      <div className="card" style={{ padding: 14 }}>
        <div className="text-xs muted" style={{ marginBottom: 10 }}>
          Powtórzenia stoją w miejscu, a RPE nie spada — kandydaci do regresji lub zmiany wariantu.
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
                  {p.sessionsConsidered} sesji obserwacji · PR <span className="mono">{p.pr}</span>{" "}
                  · {p.unit}
                </div>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <div style={{ textAlign: "right" }}>
                  <div className="mono muted text-xs">śr. reps</div>
                  <div className="mono" style={{ fontWeight: 600 }}>
                    {p.recentAvgReps}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono muted text-xs">śr. RPE</div>
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
// Plan section: session usage + totals
// ============================================================

function PlanSection({
  usage,
  totals,
}: {
  usage: ReturnType<typeof useLoaderData<typeof loader>>["planUsage"];
  totals: ReturnType<typeof useLoaderData<typeof loader>>["planTotals"];
}) {
  if (!usage.planName && !totals.planName) return null;
  return (
    <Section
      title={`Aktywny plan${totals.planName ? ` — ${totals.planName}` : ""}`}
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
            Wykorzystanie sesji
          </div>
          {usage.sessions.length === 0 ? (
            <div className="text-xs muted">Plan bez sesji.</div>
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
                    {s.lastPerformedOn ? daysAgo(s.lastPerformedOn) : "—"}
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
            Łącznie na tym planie
          </div>
          <div className="col" style={{ gap: 6 }}>
            <PlanRow label="Sesji" value={totals.totalSessionsOnPlan} />
            <PlanRow label="Serii" value={totals.totalSets} />
            <PlanRow label="Powtórzeń" value={totals.totalReps} />
            {totals.totalSeconds > 0 && (
              <PlanRow label="Sekund pod tension" value={totals.totalSeconds} />
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

function PlanRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="row between" style={{ fontSize: 13 }}>
      <span className="muted">{label}</span>
      <span className="mono" style={{ fontWeight: 600 }}>
        {value.toLocaleString("pl-PL")}
      </span>
    </div>
  );
}

// ============================================================
// Tag distribution
// ============================================================

function TagDistributionSection({
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
    segments.push({
      label: "bez kategorii",
      value: untagged,
      color: "var(--surface-2)",
    });
  }
  return (
    <Section title="Rozkład kategorii (30 dni)" icon={<Icons.Filter />}>
      <div className="card" style={{ padding: 14 }}>
        {shares.length === 0 && untagged > 0 ? (
          <div className="text-xs muted">
            Ćwiczenia bez tagów — dodaj kategorie w bibliotece, by zobaczyć balans.
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
// Coverage: video + body photos
// ============================================================

function CoverageSection({
  video,
  photos,
  trainee,
}: {
  video: ReturnType<typeof useLoaderData<typeof loader>>["videoCov"];
  photos: ReturnType<typeof useLoaderData<typeof loader>>["photoCov"];
  trainee: { id: string; displayName: string };
}) {
  return (
    <Section title="Coverage" icon={<Icons.Camera />}>
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
            Wideo serii (30 dni)
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
            {video.total === 0 ? "—" : `${video.pct}%`}
          </div>
          <div className="text-xs muted" style={{ marginTop: 4 }}>
            {video.total === 0
              ? "brak serii w 30 dni"
              : `${video.withVideo} z ${video.total} serii z nagraniem`}
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
              Sylwetka
            </div>
            <Link
              to={`/trener/podopieczni/${trainee.id}/sylwetka`}
              className="text-xs"
              style={{ color: "var(--muted)" }}
            >
              Zobacz <Icons.Chev />
            </Link>
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
            {photos.daysSinceLast == null ? "—" : daysAgo(isoFromDaysAgo(photos.daysSinceLast))}
          </div>
          <div className="text-xs muted" style={{ marginTop: 4 }}>
            ostatnie zdjęcie · {photos.totalPhotos} łącznie
          </div>
          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            <ViewChip label="Przód" on={photos.views.front} />
            <ViewChip label="Bok" on={photos.views.side} />
            <ViewChip label="Tył" on={photos.views.back} />
          </div>
        </div>
      </div>
    </Section>
  );
}

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

// ============================================================
// PR mini-list (just top 10 with fresh-badge)
// ============================================================

function PRMiniList({
  prs,
}: {
  prs: ReturnType<typeof useLoaderData<typeof loader>>["prs"];
}) {
  const top = prs.slice(0, 10);
  return (
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
      {top.map((pr) => (
        <div
          key={pr.exerciseId}
          className="list-row"
          style={{ gridTemplateColumns: "1fr 80px 100px 90px", gap: 14 }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{pr.exerciseName}</div>
          </div>
          <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
            {pr.pr}
            <span className="muted" style={{ fontSize: 10, fontWeight: 400, marginLeft: 3 }}>
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
              >
                świeży
              </span>
            )}
          </div>
        </div>
      ))}
      {prs.length > top.length && (
        <div className="text-xs muted" style={{ padding: "10px 14px", textAlign: "center" }}>
          + {prs.length - top.length} ćwiczeń z rekordami…
        </div>
      )}
    </div>
  );
}
