import { and, eq } from "drizzle-orm";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { daysAgo, fmtDate } from "~/lib/format";
import {
  getExerciseProgress,
  getHealthStats,
  getPersonalRecords,
  type ExerciseProgress,
  type HealthStats,
} from "~/lib/stats";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";

  // Ownership check — same pattern as podopieczni.$traineeId.tsx.
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

  const [health, progress, prs] = await Promise.all([
    getHealthStats(db, traineeId),
    getExerciseProgress(db, traineeId),
    getPersonalRecords(db, traineeId, { limit: 100 }),
  ]);

  return { trainee, health, progress, prs };
}

export default function TrenerStatystyki() {
  const { trainee, health, progress, prs } = useLoaderData<typeof loader>();
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
          <div className="sub">Podgląd aktywności, RPE i progresji.</div>
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
          <ExerciseProgressSection progress={progress} />
        </>
      )}
    </div>
  );
}

function HealthTiles({ health }: { health: HealthStats }) {
  // Activity tile colour: green ≤7d & ≥2 sess/week, yellow 8–14d, red >14d.
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

  const adTone =
    health.allDonePct < 70 && health.hasAnyLog30d
      ? "var(--warn)"
      : "var(--ink)";

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
            : `${daysAgo(isoFromDaysAgo(health.daysSinceLastSession))}`
        }
        sub={`${health.sessionsLast7} sesji w 7 dni`}
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
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
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

function ExerciseProgressSection({ progress }: { progress: ExerciseProgress[] }) {
  if (progress.length === 0) {
    return null;
  }
  return (
    <section>
      <div
        className="row between"
        style={{ alignItems: "baseline", marginBottom: 12 }}
      >
        <h2 style={{ fontSize: 17 }}>Ćwiczenia</h2>
        <span className="text-xs muted">
          sortowane: wymagające uwagi na górze
        </span>
      </div>

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
              <span
                className="muted"
                style={{ fontSize: 10, fontWeight: 400, marginLeft: 3 }}
              >
                {p.unit === "SEC" ? "s" : "rep"}
              </span>
            </div>
            <div className="mono text-xs muted">{fmtDate(p.prAchievedOn)}</div>
            <div className="mono text-sm">
              {p.recentAvgReps}
              {p.deltaPct != null && (
                <span
                  className="text-xs muted"
                  style={{ marginLeft: 6, fontWeight: 400 }}
                >
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
    </section>
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
