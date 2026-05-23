import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { VideoButton } from "~/components/video-modal";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { signFileUrl } from "~/lib/files";
import { daysAgo, fmtDate } from "~/lib/format";
import { loadLogForViewer } from "~/lib/workouts";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const logId = args.params.logId ?? "";

  const detail = await loadLogForViewer(db, logId, {
    id: user.id,
    role: "trainer",
    trainerId: null,
  });
  if (!detail || detail.log.traineeId !== traineeId) {
    throw new Response("not found", { status: 404 });
  }

  const exercises = detail.exercises.map((ex) => ({
    ...ex,
    sets: ex.sets.map((s) => ({
      ...s,
      videoUrl: s.videoFileId ? signFileUrl(s.videoFileId, user.id) : null,
    })),
  }));

  return { log: detail.log, trainee: detail.trainee, exercises };
}

function tone(diff: number): string {
  if (diff <= 4) return "var(--ok)";
  if (diff <= 7) return "var(--warn)";
  return "var(--danger)";
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export default function TrenerWorkoutLogDetail() {
  const { log, trainee, exercises } = useLoaderData<typeof loader>();
  const totalSets = exercises.reduce((a, e) => a + e.sets.length, 0);
  const allDiff = exercises.flatMap((e) => e.sets.map((s) => s.log.difficulty));
  const avgDiff =
    allDiff.length === 0
      ? 0
      : Math.round((allDiff.reduce((a, b) => a + b, 0) / allDiff.length) * 10) / 10;

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <span className="current">{log.sessionName}</span>
      </div>

      <div
        className="row between"
        style={{
          paddingBottom: 22,
          marginBottom: 24,
          borderBottom: "1px solid var(--line)",
          alignItems: "flex-end",
          gap: 16,
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {fmtDate(log.performedOn)} · {daysAgo(log.performedOn)}
          </div>
          <h1 style={{ fontSize: 24 }}>{log.sessionName}</h1>
          <div className="row" style={{ gap: 14, marginTop: 6, color: "var(--muted)", fontSize: 13.5 }}>
            <span>
              <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>
                {exercises.length}
              </span>{" "}
              ćwiczeń
            </span>
            <span>·</span>
            <span>
              <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>
                {totalSets}
              </span>{" "}
              serii
            </span>
            <span>·</span>
            <span>
              śr. trudność{" "}
              <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>
                {avgDiff}/10
              </span>
            </span>
          </div>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <span className="avatar">{initialsOf(trainee.displayName)}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{trainee.displayName}</div>
            <div className="mono text-xs muted">{trainee.id.slice(0, 8).toUpperCase()}</div>
          </div>
        </div>
      </div>

      {log.note != null && log.note.length > 0 && (
        <div
          className="card"
          style={{
            borderLeft: "3px solid var(--accent)",
            borderRadius: "4px 12px 12px 4px",
            fontSize: 14,
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <Icons.Note style={{ color: "var(--muted)", marginTop: 2 }} />
            <div>
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                  marginBottom: 4,
                }}
              >
                Notatka podopiecznego
              </div>
              {log.note}
            </div>
          </div>
        </div>
      )}

      <div className="col" style={{ gap: 16 }}>
        {exercises.map((ex, eIdx) => {
          const setCount = ex.sets.length;
          const totalReps = ex.sets.reduce((a, s) => a + s.log.reps, 0);
          const avgReps = setCount === 0 ? 0 : totalReps / setCount;
          const exAvgDiff =
            setCount === 0
              ? 0
              : ex.sets.reduce((a, s) => a + s.log.difficulty, 0) / setCount;
          return (
            <div key={ex.log.id} className="card card-padless">
              <div
                className="row"
                style={{
                  padding: "14px 18px",
                  gap: 14,
                  borderBottom: "1px solid var(--line)",
                  alignItems: "center",
                }}
              >
                <div className="mono text-xs muted" style={{ width: 24 }}>
                  {String(eIdx + 1).padStart(2, "0")}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="row" style={{ gap: 10, alignItems: "center" }}>
                    <h3 style={{ fontSize: 15.5, margin: 0 }}>{ex.exercise.name}</h3>
                    <span className={`badge${ex.exercise.unit === "REPS" ? " active" : ""}`}>
                      {ex.exercise.unit}
                    </span>
                  </div>
                </div>
                <div className="row" style={{ gap: 18 }}>
                  <div style={{ textAlign: "right" }}>
                    <div
                      className="mono muted"
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: ".08em",
                      }}
                    >
                      Średnio
                    </div>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
                      {avgReps.toFixed(1)} {ex.exercise.unit === "SEC" ? "s" : "rep"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      className="mono muted"
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: ".08em",
                      }}
                    >
                      Trudność
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: tone(exAvgDiff),
                      }}
                    >
                      {exAvgDiff.toFixed(1)}/10
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="row"
                style={{
                  padding: 18,
                  gap: 18,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    className="set-grid"
                    style={{
                      gridTemplateColumns: "44px 78px 70px 1fr 60px",
                      marginBottom: 4,
                    }}
                  >
                    <span className="label-mini">Seria</span>
                    <span className="label-mini">
                      {ex.exercise.unit === "REPS" ? "Powt." : "Sek."}
                    </span>
                    <span className="label-mini">Trudn.</span>
                    <span className="label-mini">Wizualnie</span>
                    <span className="label-mini">Video</span>
                  </div>
                  {ex.sets.map((s, sIdx) => (
                    <div
                      key={s.log.id}
                      className="set-grid"
                      style={{
                        gridTemplateColumns: "44px 78px 70px 1fr 60px",
                        padding: "8px 0",
                        borderTop: sIdx > 0 ? "1px dashed var(--line)" : "none",
                        alignItems: "center",
                      }}
                    >
                      <span className="mono" style={{ fontWeight: 600 }}>
                        #{sIdx + 1}
                      </span>
                      <span className="mono">
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{s.log.reps}</span>{" "}
                        <span className="muted text-xs">
                          {ex.exercise.unit === "SEC" ? "sek" : "rep"}
                        </span>
                      </span>
                      <span
                        className="mono"
                        style={{
                          color: tone(s.log.difficulty),
                          fontWeight: 600,
                        }}
                      >
                        {s.log.difficulty}/10
                      </span>
                      <div style={{ display: "flex", gap: 2 }}>
                        {Array.from({ length: 10 }, (_, n) => `cell-${n}`).map((cellKey, n) => (
                          <div
                            key={cellKey}
                            style={{
                              flex: 1,
                              height: 6,
                              borderRadius: 2,
                              background:
                                n < s.log.difficulty ? tone(s.log.difficulty) : "var(--surface-2)",
                            }}
                          />
                        ))}
                      </div>
                      <span>
                        {s.videoUrl ? (
                          <VideoButton
                            src={s.videoUrl}
                            title={`${ex.exercise.name} · seria ${sIdx + 1}`}
                            label="video"
                            size="sm"
                          />
                        ) : (
                          <span className="mono text-xs muted">—</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
