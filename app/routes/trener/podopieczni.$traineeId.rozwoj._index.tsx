import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ProgressionList } from "~/components/progression-list";
import { SkillTreeView } from "~/components/skill-tree";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";
import { findTraineeOfTrainer, listProgressionExercises } from "~/lib/progression";
import {
  excludeByExerciseId,
  sortProgressionRows,
  summarizeStatuses,
} from "~/lib/progression-math";
import { getSkillTreeForTrainee } from "~/lib/skill-tree";
import { listExerciseSkillMap } from "~/lib/skills";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });
  const url = new URL(args.request.url);

  const [tree, allRows, skillMap] = await Promise.all([
    getSkillTreeForTrainee(db, user.id, traineeId),
    listProgressionExercises(db, traineeId),
    listExerciseSkillMap(db, user.id),
  ]);

  const variantIds = new Set(skillMap.map((s) => s.exerciseId));
  const rows = excludeByExerciseId(allRows, variantIds);
  const summary = summarizeStatuses(rows);

  const tagSet = new Set<string>();
  for (const r of rows) for (const t of r.tags) tagSet.add(t);
  const tagOptions = [...tagSet].sort((a, b) => a.localeCompare(b, "pl"));

  const spec: ListControlsSpec = {
    sortOptions: [
      { key: "recent", label: "Ostatnio trenowane" },
      { key: "attention", label: "Wymaga uwagi" },
    ],
    defaultSort: "attention",
    filterGroups: [
      {
        param: "tag",
        label: "Kategoria",
        options: [
          { value: "all", label: "Wszystkie" },
          ...tagOptions.map((t) => ({ value: t, label: t })),
        ],
        defaultValue: "all",
      },
    ],
    searchable: false,
  };
  const controls = parseListControls(url.searchParams, spec);
  const tag = controls.filters.tag ?? "all";
  const filtered = tag === "all" ? rows : rows.filter((r) => r.tags.includes(tag));
  const visible = sortProgressionRows(filtered, controls.sort as "recent" | "attention");

  return { trainee, tree, rows: visible, summary, spec, controls };
}

export default function TrenerRozwoj() {
  const { trainee, tree, rows, summary, spec, controls } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <span className="current">Rozwój</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {trainee.displayName}
          </div>
          <h1>Rozwój</h1>
          <div className="sub">
            Drzewo umiejętności i postęp w ćwiczeniach. Klik węzeł, by zarządzać poziomem.
          </div>
        </div>
      </div>

      <SkillTreeView
        tree={tree}
        showStates
        hrefForNode={(skillId) => `/trener/podopieczni/${trainee.id}/rozwoj/umiejetnosc/${skillId}`}
      />

      <div style={{ marginTop: 28 }}>
        <ProgressionList
          title="Pozostałe ćwiczenia"
          rows={rows}
          summary={summary}
          spec={spec}
          controls={controls}
          hrefForExercise={(id) => `/trener/podopieczni/${trainee.id}/rozwoj/cwiczenie/${id}`}
          buildCompareHref={(ids) =>
            `/trener/podopieczni/${trainee.id}/rozwoj/porownanie?ex=${ids.join(",")}`
          }
        />
      </div>
    </div>
  );
}
