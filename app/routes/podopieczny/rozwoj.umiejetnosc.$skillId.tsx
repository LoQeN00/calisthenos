import { useTranslation } from "react-i18next";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ExerciseProgressionPanel } from "~/components/exercise-progression-panel";
import { VariationLadder } from "~/components/skill-tree";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate } from "~/lib/format";
import { getExerciseProgression } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";
import { getSkillMapForTrainee } from "~/lib/skill-progression";

const RANGES: ProgressionRange[] = ["4w", "3m", "6m", "all"];

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  if (!user.trainerId) throw new Response("Konto bez przypisanego trenera.", { status: 400 });
  const skillId = args.params.skillId ?? "";
  const map = await getSkillMapForTrainee(db, user.trainerId, user.id, { withSuggestions: false });
  const entry = map.find((m) => m.skillId === skillId);
  if (!entry) throw new Response("not found", { status: 404 });

  const url = new URL(args.request.url);
  const raw = url.searchParams.get("zakres");
  const range: ProgressionRange = (RANGES as string[]).includes(raw ?? "")
    ? (raw as ProgressionRange)
    : "3m";
  const view =
    entry.currentHasLogs && entry.currentExerciseId
      ? await getExerciseProgression(db, user.id, entry.currentExerciseId, range)
      : null;

  return { entry, view, range };
}

export default function PodopiecznyRozwojWezel() {
  const { entry, view, range } = useLoaderData<typeof loader>();
  const { t } = useTranslation("podopieczny");
  return (
    <div>
      <div className="crumbs">
        <Link to="/podopieczny/rozwoj">{t("rozwoj.umiejetnosc.crumb")}</Link>
        <span className="sep">›</span>
        <span className="current">{entry.skillName}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("rozwoj.umiejetnosc.eyebrow")}
          </div>
          <h1>{entry.skillName}</h1>
          <div className="sub">{t("rozwoj.umiejetnosc.subtitle")}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 22 }}>
        <VariationLadder variations={entry.variations} />
        {entry.lastAdvancedOn && (
          <div className="text-xs muted" style={{ marginTop: 10 }}>
            {t("rozwoj.umiejetnosc.lastAdvanced", { date: fmtDate(entry.lastAdvancedOn) })}
          </div>
        )}
      </div>

      {view ? (
        <ExerciseProgressionPanel view={view} range={range} />
      ) : (
        <div className="card" style={{ padding: 18 }}>
          <div className="muted text-sm">
            {entry.currentVariationId
              ? t("rozwoj.umiejetnosc.noDataVariant")
              : t("rozwoj.umiejetnosc.noLevel")}
          </div>
        </div>
      )}
    </div>
  );
}
