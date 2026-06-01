import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { ProgressionList } from "~/components/progression-list";
import { SkillTreeView } from "~/components/skill-tree";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";
import { listProgressionExercises } from "~/lib/progression";
import {
  excludeByExerciseId,
  sortProgressionRows,
  summarizeStatuses,
} from "~/lib/progression-math";
import { getSkillTreeForTrainee } from "~/lib/skill-tree";
import { listExerciseSkillMap } from "~/lib/skills";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  if (!user.trainerId) throw new Response("Konto bez przypisanego trenera.", { status: 400 });
  const url = new URL(args.request.url);

  const [tree, allRows, skillMap] = await Promise.all([
    getSkillTreeForTrainee(db, user.trainerId, user.id),
    listProgressionExercises(db, user.id),
    listExerciseSkillMap(db, user.trainerId),
  ]);

  // Ćwiczenia będące wariantem dowolnej umiejętności — wyłączone z listy (żyją w drzewie).
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
    defaultSort: "recent",
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

  return { tree, rows: visible, summary, spec, controls };
}

export default function PodopiecznyRozwoj() {
  const { tree, rows, summary, spec, controls } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny
          </div>
          <h1>Rozwój</h1>
          <div className="sub">Twoje drzewo umiejętności i postęp w ćwiczeniach.</div>
        </div>
      </div>

      <SkillTreeView
        tree={tree}
        showStates
        hrefForNode={(skillId) => `/podopieczny/rozwoj/umiejetnosc/${skillId}`}
      />

      <div style={{ marginTop: 28 }}>
        <ProgressionList
          title="Pozostałe ćwiczenia"
          rows={rows}
          summary={summary}
          spec={spec}
          controls={controls}
          hrefForExercise={(id) => `/podopieczny/rozwoj/cwiczenie/${id}`}
          buildCompareHref={(ids) => `/podopieczny/rozwoj/porownanie?ex=${ids.join(",")}`}
        />
      </div>
    </div>
  );
}
