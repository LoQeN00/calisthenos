import { useTranslation } from "react-i18next";
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
import { resolveCatalogOrgId } from "~/lib/catalog";
import { getSkillTreeForTrainee } from "~/lib/skill-tree";
import { listExerciseSkillMap } from "~/lib/skills";

const SPEC_BASE: ListControlsSpec = {
  sortOptions: [
    { key: "recent", label: "" },
    { key: "attention", label: "" },
  ],
  defaultSort: "recent",
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
  const user = await requireUser(args.request, db, { role: "trainee" });
  if (!user.trainerId) throw new Response("Konto bez przypisanego trenera.", { status: 400 });
  const url = new URL(args.request.url);

  // Katalog markowy należy do organizacji TRENERA — rozwiąż org po trainerId
  // (org podopiecznego może być inna/niezsynchronizowana, więc jej nie używamy).
  const trainerOrgId = await resolveCatalogOrgId(db, {
    organizationId: null,
    trainerId: user.trainerId,
  });

  const [tree, allRows, skillMap] = await Promise.all([
    getSkillTreeForTrainee(
      db,
      { trainerId: user.trainerId, organizationId: trainerOrgId },
      user.id,
    ),
    listProgressionExercises(db, user.id),
    listExerciseSkillMap(db, { trainerId: user.trainerId, organizationId: trainerOrgId }),
  ]);

  // Ćwiczenia będące wariantem dowolnej umiejętności — wyłączone z listy (żyją w drzewie).
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

  return { tree, rows: visible, summary, tagOptions, controls };
}

export default function PodopiecznyRozwoj() {
  const { tree, rows, summary, tagOptions, controls } = useLoaderData<typeof loader>();
  const { t } = useTranslation("podopieczny");

  const spec: ListControlsSpec = {
    ...SPEC_BASE,
    sortOptions: [
      { key: "recent", label: t("rozwoj.sortOptions.recent") },
      { key: "attention", label: t("rozwoj.sortOptions.attention") },
    ],
    filterGroups: [
      {
        param: "tag",
        label: t("rozwoj.filterCategory"),
        options: [
          { value: "all", label: t("rozwoj.filterAll") },
          ...tagOptions.map((tag) => ({ value: tag, label: tag })),
        ],
        defaultValue: "all",
      },
    ],
  };

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("rozwoj.eyebrow")}
          </div>
          <h1>{t("rozwoj.title")}</h1>
          <div className="sub">{t("rozwoj.subtitle")}</div>
        </div>
      </div>

      <SkillTreeView
        tree={tree}
        showStates
        hrefForNode={(skillId) => `/podopieczny/rozwoj/umiejetnosc/${skillId}`}
      />

      <div style={{ marginTop: 28 }}>
        <ProgressionList
          title={t("rozwoj.remainingTitle")}
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
