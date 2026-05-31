import { useEffect, useRef } from "react";
import { Link, useLoaderData, useSearchParams, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { useToast } from "~/components/toast-provider";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { signFileUrl } from "~/lib/files";
import { daysAgo, fmtDate } from "~/lib/format";
import { loadLogForViewer } from "~/lib/workouts";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const logId = args.params.logId ?? "";

  const detail = await loadLogForViewer(db, logId, {
    id: user.id,
    role: "trainee",
    trainerId: user.trainerId,
  });
  if (!detail) throw new Response("not found", { status: 404 });

  // Pre-sign URLs for any per-set videos so the page is render-ready.
  const exercises = detail.exercises.map((ex) => ({
    ...ex,
    sets: ex.sets.map((s) => ({
      ...s,
      videoUrl: s.videoFileId ? signFileUrl(s.videoFileId, user.id) : null,
    })),
  }));

  return {
    log: detail.log,
    exercises,
    totalExpectedSets: detail.totalExpectedSets,
  };
}

export default function TraineeLogDetail() {
  const { log, exercises, totalExpectedSets } = useLoaderData<typeof loader>();
  const totalSets = exercises.reduce((a, e) => a + e.sets.length, 0);
  const skippedSets = Math.max(0, totalExpectedSets - totalSets);
  const allDiff = exercises.flatMap((e) => e.sets.map((s) => s.log.difficulty));
  const avgDiff =
    allDiff.length === 0
      ? 0
      : Math.round((allDiff.reduce((a, b) => a + b, 0) / allDiff.length) * 10) / 10;

  usePRToasts(exercises);

  return (
    <div>
      <div className="crumbs">
        <Link to="/podopieczny/historia">Historia</Link>
        <span className="sep">›</span>
        <span className="current">{log.sessionName}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {fmtDate(log.performedOn)} · {daysAgo(log.performedOn)}
          </div>
          <h1>{log.sessionName}</h1>
          <div className="sub">
            <span className="mono">{exercises.length}</span> ćwiczeń ·{" "}
            <span className="mono">{totalSets}</span>
            {totalExpectedSets > 0 ? (
              <>
                {" "}
                z <span className="mono">{totalExpectedSets}</span> serii
              </>
            ) : (
              " serii"
            )}
            {skippedSets > 0 && (
              <>
                {" · "}
                <strong style={{ color: "var(--warn)" }}>
                  {skippedSets} pominięt{skippedSets === 1 ? "a" : "ych"}
                </strong>
              </>
            )}
            {" · śr. trudność "}
            <strong style={{ color: "var(--ink)" }} className="mono">
              {avgDiff}/10
            </strong>
          </div>
        </div>
      </div>

      {log.note != null && log.note.length > 0 && (
        <div
          className="card"
          style={{
            borderLeft: "3px solid var(--accent)",
            fontSize: 13,
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          {log.note}
        </div>
      )}

      <div className="col" style={{ gap: 12 }}>
        {exercises.map((ex, eIdx) => (
          <ExerciseLogCard key={ex.log.id} exercise={ex} index={eIdx} />
        ))}
      </div>
    </div>
  );
}

function usePRToasts(
  exercises: Array<{ exercise: { id: string; name: string; unit: "REPS" | "SEC" } }>,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const firedRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fires once on first render with ?pr=…
  useEffect(() => {
    if (firedRef.current) return;
    const raw = searchParams.get("pr");
    if (!raw) return;
    firedRef.current = true;

    const ids = raw.split(",").filter(Boolean);
    const byId = new Map(exercises.map((e) => [e.exercise.id, e.exercise]));
    const names = ids.map((id) => byId.get(id)?.name).filter((n): n is string => !!n);

    if (names.length === 1) {
      toast(`🏆 Nowy rekord w ${names[0]}!`, { durationMs: 5000 });
    } else if (names.length > 1) {
      toast(`🏆 Nowe rekordy: ${names.join(", ")}`, { durationMs: 6000 });
    }

    // Strip the param so a refresh doesn't refire.
    const next = new URLSearchParams(searchParams);
    next.delete("pr");
    setSearchParams(next, { replace: true });
  }, []);
}

type ExWithSigned = {
  log: { id: string; ordinal: number };
  exercise: { id: string; name: string; unit: "REPS" | "SEC" };
  sets: Array<{
    log: { id: string; ordinal: number; reps: number; difficulty: number };
    videoUrl: string | null;
  }>;
  expectedSets: number;
  expectedReps: number;
};

function ExerciseLogCard({ exercise: ex, index }: { exercise: ExWithSigned; index: number }) {
  const totalReps = ex.sets.reduce((a, s) => a + s.log.reps, 0);
  const avgReps = ex.sets.length === 0 ? 0 : Math.round((totalReps / ex.sets.length) * 10) / 10;
  const skippedHere = Math.max(0, ex.expectedSets - ex.sets.length);

  const setsByOrdinal = new Map(ex.sets.map((s) => [s.log.ordinal, s]));
  const lastLoggedOrdinal =
    ex.sets.length > 0 ? Math.max(...ex.sets.map((s) => s.log.ordinal)) : -1;
  const rowCount = Math.max(ex.expectedSets, lastLoggedOrdinal + 1);
  const rows = Array.from({ length: rowCount }, (_, ordinal) => ({
    ordinal,
    logged: setsByOrdinal.get(ordinal) ?? null,
  }));

  return (
    <div className="card card-padless">
      <div
        className="row between"
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--line)",
          alignItems: "flex-start",
        }}
      >
        <div>
          <span className="mono text-xs muted">#{String(index + 1).padStart(2, "0")}</span>
          <h3 style={{ margin: "2px 0 0" }}>{ex.exercise.name}</h3>
          {skippedHere > 0 && (
            <span
              className="badge"
              style={{
                marginTop: 4,
                background: "rgba(226, 162, 58, 0.12)",
                borderColor: "var(--warn)",
                color: "var(--warn)",
                fontSize: 10,
              }}
            >
              {ex.sets.length}/{ex.expectedSets} serii
            </span>
          )}
        </div>
        <div className="mono text-xs muted" style={{ textAlign: "right" }}>
          śr. {avgReps} {ex.exercise.unit === "SEC" ? "s" : "rep"}
        </div>
      </div>
      <div style={{ padding: 12, display: "grid", gap: 6 }}>
        {rows.map(({ ordinal, logged }) =>
          logged == null ? (
            <SkippedSetRow
              key={`skip-${ordinal}`}
              ordinal={ordinal}
              expectedReps={ex.expectedReps}
              unit={ex.exercise.unit}
            />
          ) : (
            <SetRowDisplay
              key={logged.log.id}
              ordinal={ordinal}
              reps={logged.log.reps}
              difficulty={logged.log.difficulty}
              unit={ex.exercise.unit}
              videoUrl={logged.videoUrl}
            />
          ),
        )}
      </div>
    </div>
  );
}

function SkippedSetRow({
  ordinal,
  expectedReps,
  unit,
}: {
  ordinal: number;
  expectedReps: number;
  unit: "REPS" | "SEC";
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr",
        gap: 10,
        alignItems: "center",
        padding: "8px 10px",
        background: "var(--surface-2)",
        border: "1px dashed var(--line-2)",
        borderRadius: 8,
      }}
    >
      <span className="mono text-xs muted">#{ordinal + 1}</span>
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
        Pominięta
        {expectedReps > 0 && (
          <span
            className="muted"
            style={{
              marginLeft: 8,
              textTransform: "none",
              letterSpacing: 0,
              fontWeight: 400,
            }}
          >
            · plan: {expectedReps} {unit === "SEC" ? "sek." : "powt."}
          </span>
        )}
      </span>
    </div>
  );
}

function SetRowDisplay({
  ordinal,
  reps,
  difficulty,
  unit,
  videoUrl,
}: {
  ordinal: number;
  reps: number;
  difficulty: number;
  unit: "REPS" | "SEC";
  videoUrl: string | null;
}) {
  const tone = difficulty <= 4 ? "var(--ok)" : difficulty <= 7 ? "var(--warn)" : "var(--danger)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr auto auto",
        gap: 10,
        alignItems: "center",
        padding: "8px 10px",
        background: "var(--bg)",
        border: "1px solid var(--line)",
        borderRadius: 8,
      }}
    >
      <span className="mono text-xs muted">#{ordinal + 1}</span>
      <span style={{ fontSize: 14, fontWeight: 600 }} className="mono">
        {reps}
        <span
          style={{
            fontSize: 11,
            fontWeight: 400,
            color: "var(--muted)",
            marginLeft: 4,
            fontFamily: "var(--font-body)",
          }}
        >
          {unit === "SEC" ? "s" : "rep"}
        </span>
      </span>
      <span
        className="mono"
        style={{
          fontSize: 12,
          color: tone,
          fontWeight: 600,
          background: "var(--surface-2)",
          padding: "2px 8px",
          borderRadius: 999,
        }}
      >
        {difficulty}/10
      </span>
      {videoUrl ? (
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm"
          style={{ height: 26, padding: "0 8px", fontSize: 11 }}
        >
          <Icons.Play /> video
        </a>
      ) : (
        <span style={{ width: 1 }} />
      )}
    </div>
  );
}
