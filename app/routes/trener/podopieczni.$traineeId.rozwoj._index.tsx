import { useTranslation } from "react-i18next";
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

// Labels filled in from i18n in the component; the loader only needs the shape
// (keys/params/defaults) to parse URL controls — labels don't affect parsing.
const SPEC_BASE: ListControlsSpec = {
  sortOptions: [
    { key: "recent", label: "" },
    { key: "attention", label: "" },
  ],
  defaultSort: "attention",
  filterGroups: [
    {
      param: "tag",
      label: "",
      options: [{ value: "all", label: "" }],
      defaultValue: "all",
    },
  ],
  searchable: false,
};

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });
  const url = new URL(args.request.url);

  const [tree, allRows, skillMap] = await Promise.all([
    getSkillTreeForTrainee(
      db,
      { trainerId: user.id, organizationId: user.organizationId },
      traineeId,
    ),
    listProgressionExercises(db, traineeId),
    listExerciseSkillMap(db, { trainerId: user.id, organizationId: user.organizationId }),
  ]);

  const variantIds = new Set(skillMap.map((s) => s.exerciseId));
  const rows = excludeByExerciseId(allRows, variantIds);
  const summary = summarizeStatuses(rows);

  const tagSet = new Set<string>();
  for (const r of rows) for (const t of r.tags) tagSet.add(t);
  const tagOptions = [...tagSet].sort((a, b) => a.localeCompare(b, "pl"));

  const controls = parseListControls(url.searchParams, SPEC_BASE);
  const tag = controls.filters.tag ?? "all";
  const filtered = tag === "all" ? rows : rows.filter((r) => r.tags.includes(tag));
  const visible = sortProgressionRows(filtered, controls.sort as "recent" | "attention");

  return { trainee, tree, rows: visible, summary, tagOptions, controls };
}

export default function TrenerRozwoj() {
  const { trainee, tree, rows, summary, tagOptions, controls } = useLoaderData<typeof loader>();
  const { t } = useTranslation("trenerRozwoj");

  const spec: ListControlsSpec = {
    ...SPEC_BASE,
    sortOptions: [
      { key: "recent", label: t("rozwoj.sort.recent") },
      { key: "attention", label: t("rozwoj.sort.attention") },
    ],
    filterGroups: [
      {
        param: "tag",
        label: t("rozwoj.filter.category"),
        options: [
          { value: "all", label: t("rozwoj.filter.all") },
          ...tagOptions.map((tag) => ({ value: tag, label: tag })),
        ],
        defaultValue: "all",
      },
    ],
  };

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">{t("breadcrumb.podopieczni")}</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <span className="current">{t("rozwoj.current")}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {trainee.displayName}
          </div>
          <h1>{t("rozwoj.title")}</h1>
          <div className="sub">{t("rozwoj.subtitle")}</div>
        </div>
      </div>

      <SkillTreeView
        tree={tree}
        showStates
        hrefForNode={(skillId) => `/trener/podopieczni/${trainee.id}/rozwoj/umiejetnosc/${skillId}`}
      />

      <div style={{ marginTop: 28 }}>
        <ProgressionList
          title={t("rozwoj.otherExercises")}
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
