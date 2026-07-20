import { useTranslation } from "react-i18next";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { VideoButton } from "~/components/video-modal";
import { langToIntlLocale, type Lang } from "~/i18n/config";
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

  return {
    log: detail.log,
    trainee: detail.trainee,
    exercises,
    totalExpectedSets: detail.totalExpectedSets,
  };
}

function tone(diff: number | null): string {
  if (diff === null) return "var(--muted)";
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
  const { log, trainee, exercises, totalExpectedSets } = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation("trenerPodopieczni");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const totalSets = exercises.reduce((a, e) => a + e.sets.length, 0);
  const skippedSets = Math.max(0, totalExpectedSets - totalSets);
  const allDiff = exercises
    .flatMap((e) => e.sets.map((s) => s.log.difficulty))
    .filter((d): d is number => d !== null);
  const avgDiff =
    allDiff.length === 0
      ? null
      : Math.round((allDiff.reduce((a, b) => a + b, 0) / allDiff.length) * 10) / 10;

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">{t("log.crumb")}</Link>
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
            {fmtDate(log.performedOn, locale)} · {daysAgo(log.performedOn, locale)}
          </div>
          <h1 style={{ fontSize: 24 }}>{log.sessionName}</h1>
          <div
            className="row"
            style={{ gap: 14, marginTop: 6, color: "var(--muted)", fontSize: 13.5 }}
          >
            <span>
              <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>
                {exercises.length}
              </span>{" "}
              {t("log.exercises")}
            </span>
            <span>·</span>
            <span>
              <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>
                {totalSets}
              </span>{" "}
              {totalExpectedSets > 0 ? (
                <>
                  {t("log.ofSets", { total: totalExpectedSets })}
                </>
              ) : (
                t("log.sets")
              )}
            </span>
            {skippedSets > 0 && (
              <span style={{ color: "var(--warn)", fontWeight: 600 }}>
                · {t("log.skipped", { count: skippedSets })}
              </span>
            )}
            {avgDiff != null && (
              <>
                <span>·</span>
                <span>
                  {t("log.avgDifficulty")}{" "}
                  <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>
                    {avgDiff}/10
                  </span>
                </span>
              </>
            )}
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
                {t("log.traineeNote")}
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
          const diffSets = ex.sets.filter((s) => s.log.difficulty !== null);
          const exAvgDiff =
            diffSets.length === 0
              ? null
              : diffSets.reduce((a, s) => a + (s.log.difficulty as number), 0) / diffSets.length;
          // Czy ten wpis ćwiczenia ma jakąkolwiek ocenę RPE (data-driven, nie wg
          // bieżącej flagi ćwiczenia) — dzięki temu historyczne logi z RPE nadal
          // pokazują trudność, a ćwiczenia bez RPE chowają kolumny Trudn./Wizualnie.
          const hasRpe = exAvgDiff != null;
          const skippedHere = Math.max(0, ex.expectedSets - setCount);

          // Render a row per planned ordinal, looking up the logged set with
          // matching ordinal. Missing ordinals = skipped. Falls back to
          // whatever was logged if plan info is unavailable.
          const setsByOrdinal = new Map(ex.sets.map((s) => [s.log.ordinal, s]));
          const lastLoggedOrdinal =
            ex.sets.length > 0 ? Math.max(...ex.sets.map((s) => s.log.ordinal)) : -1;
          const rowCount = Math.max(ex.expectedSets, lastLoggedOrdinal + 1);
          const rows = Array.from({ length: rowCount }, (_, ordinal) => ({
            ordinal,
            logged: setsByOrdinal.get(ordinal) ?? null,
          }));

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
                    {skippedHere > 0 && (
                      <span
                        className="badge"
                        style={{
                          background: "rgba(226, 162, 58, 0.12)",
                          borderColor: "var(--warn)",
                          color: "var(--warn)",
                        }}
                        title={t("log.setsTooltip", { done: skippedHere, total: ex.expectedSets })}
                      >
                        {t("log.setsBadge", { done: setCount, total: ex.expectedSets })}
                      </span>
                    )}
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
                      {t("log.average")}
                    </div>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
                      {avgReps.toFixed(1)} {ex.exercise.unit === "SEC" ? t("log.unitSec") : t("log.unitRep")}
                    </div>
                  </div>
                  {hasRpe && (
                    <div style={{ textAlign: "right" }}>
                      <div
                        className="mono muted"
                        style={{
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: ".08em",
                        }}
                      >
                        {t("log.difficulty")}
                      </div>
                      <div
                        className="mono"
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: tone(exAvgDiff),
                        }}
                      >
                        {exAvgDiff == null ? "—" : `${exAvgDiff.toFixed(1)}/10`}
                      </div>
                    </div>
                  )}
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
                      gridTemplateColumns: hasRpe ? "44px 78px 70px 1fr 60px" : "44px 1fr 60px",
                      marginBottom: 4,
                    }}
                  >
                    <span className="label-mini">{t("log.set")}</span>
                    <span className="label-mini">
                      {ex.exercise.unit === "REPS" ? t("log.reps") : t("log.secs")}
                    </span>
                    {hasRpe && <span className="label-mini">{t("log.difficultyShort")}</span>}
                    {hasRpe && <span className="label-mini">{t("log.visually")}</span>}
                    <span className="label-mini">{t("log.video")}</span>
                  </div>
                  {rows.map(({ ordinal, logged }, rowIdx) =>
                    logged == null ? (
                      <div
                        key={`skip-${ordinal}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "44px 1fr",
                          padding: "8px 0",
                          borderTop: rowIdx > 0 ? "1px dashed var(--line)" : "none",
                          alignItems: "center",
                          color: "var(--muted)",
                          opacity: 0.75,
                        }}
                      >
                        <span className="mono" style={{ fontWeight: 600 }}>
                          #{ordinal + 1}
                        </span>
                        <span
                          className="mono"
                          style={{
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: ".08em",
                            color: "var(--warn)",
                            fontWeight: 600,
                          }}
                        >
                          {t("log.skippedLabel")}
                          {ex.expectedReps > 0 && (
                            <span
                              className="muted"
                              style={{
                                marginLeft: 8,
                                textTransform: "none",
                                letterSpacing: 0,
                                fontWeight: 400,
                              }}
                            >
                              · {t("log.planPrefix")} {ex.expectedReps}{" "}
                              {ex.exercise.unit === "SEC" ? t("log.planSecs") : t("log.planReps")}
                            </span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <div
                        key={logged.log.id}
                        className="set-grid"
                        style={{
                          gridTemplateColumns: hasRpe ? "44px 78px 70px 1fr 60px" : "44px 1fr 60px",
                          padding: "8px 0",
                          borderTop: rowIdx > 0 ? "1px dashed var(--line)" : "none",
                          alignItems: "center",
                        }}
                      >
                        <span className="mono" style={{ fontWeight: 600 }}>
                          #{ordinal + 1}
                        </span>
                        <span className="mono">
                          <span style={{ fontWeight: 600, fontSize: 15 }}>{logged.log.reps}</span>{" "}
                          <span className="muted text-xs">
                            {ex.exercise.unit === "SEC" ? t("log.secUnit") : t("log.repsUnit")}
                          </span>
                        </span>
                        {hasRpe && (
                          <span
                            className="mono"
                            style={{
                              color: tone(logged.log.difficulty),
                              fontWeight: 600,
                            }}
                          >
                            {logged.log.difficulty !== null ? `${logged.log.difficulty}/10` : "—"}
                          </span>
                        )}
                        {hasRpe && (
                          <div style={{ display: "flex", gap: 2 }}>
                            {Array.from({ length: 10 }, (_, n) => `cell-${n}`).map((cellKey, n) => (
                              <div
                                key={cellKey}
                                style={{
                                  flex: 1,
                                  height: 6,
                                  borderRadius: 2,
                                  background:
                                    logged.log.difficulty !== null && n < logged.log.difficulty
                                      ? tone(logged.log.difficulty)
                                      : "var(--surface-2)",
                                }}
                              />
                            ))}
                          </div>
                        )}
                        <span>
                          {logged.videoUrl ? (
                            <VideoButton
                              src={logged.videoUrl}
                              title={t("log.videoTitle", { name: ex.exercise.name, n: ordinal + 1 })}
                              label={t("log.videoLabel")}
                              size="sm"
                            />
                          ) : (
                            <span className="mono text-xs muted">—</span>
                          )}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
