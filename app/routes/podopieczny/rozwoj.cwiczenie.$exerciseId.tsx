import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ExerciseProgressionPanel } from "~/components/exercise-progression-panel";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { getExerciseProgression } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";

const RANGES: ProgressionRange[] = ["4w", "3m", "6m", "all"];

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const exerciseId = args.params.exerciseId ?? "";
  const url = new URL(args.request.url);
  const raw = url.searchParams.get("zakres");
  const range: ProgressionRange = (RANGES as string[]).includes(raw ?? "")
    ? (raw as ProgressionRange)
    : "3m";
  const view = await getExerciseProgression(db, user.id, exerciseId, range);
  if (!view) throw new Response("not found", { status: 404 });
  return { view, range };
}

export default function PodopiecznyRozwojCwiczenie() {
  const { view, range } = useLoaderData<typeof loader>();
  const { exercise } = view;
  const { unit } = exercise;
  return (
    <div>
      <div className="crumbs">
        <Link to="/podopieczny/rozwoj">Rozwój</Link>
        <span className="sep">›</span>
        <span className="current">{exercise.name}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny · Rozwój
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
