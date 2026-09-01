import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ExerciseProgressionPanel } from "~/components/exercise-progression-panel";
import { requireUser } from "~/lib/api/auth";
import { db } from "~/lib/db/client";
import { findTraineeOfTrainer, getExerciseProgression } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";

const RANGES: ProgressionRange[] = ["4w", "3m", "6m", "all"];

export async function loader(args: LoaderFunctionArgs) {
  const { user } = requireUser(args.context, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const exerciseId = args.params.exerciseId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });
  const url = new URL(args.request.url);
  const raw = url.searchParams.get("zakres");
  const range: ProgressionRange = (RANGES as string[]).includes(raw ?? "")
    ? (raw as ProgressionRange)
    : "3m";
  const view = await getExerciseProgression(db, traineeId, exerciseId, range);
  if (!view) throw new Response("not found", { status: 404 });
  return { trainee, view, range };
}

export default function TrenerRozwojCwiczenie() {
  const { trainee, view, range } = useLoaderData<typeof loader>();
  const { exercise } = view;
  const { unit } = exercise;
  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}/rozwoj`}>Rozwój</Link>
        <span className="sep">›</span>
        <span className="current">{exercise.name}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {trainee.displayName} · Rozwój
          </div>
          <h1 className="row" style={{ gap: 10, alignItems: "center" }}>
            {exercise.name}
            <span className={`badge ${unit === "REPS" ? "reps" : "sec"}`}>{unit}</span>
          </h1>
          <div className="sub">Najlepsza seria, objętość i wysiłek w czasie.</div>
        </div>
      </div>

      <ExerciseProgressionPanel view={view} range={range} />
    </div>
  );
}
