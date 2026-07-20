import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";
import { ListControls } from "~/components/list-controls";
import { Icons } from "~/components/icons";
import { Pagination, parsePage } from "~/components/pagination";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate, pluralizePl, type PlForms } from "~/lib/format";
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";
import { countLogsForTrainee, listLogsForTrainee, type LogSort } from "~/lib/workouts";

const PAGE_SIZE = 20;
const SESJA: PlForms = { one: "sesja", few: "sesje", many: "sesji" };

/** Spec used server-side for parseListControls — labels not needed here. */
const SPEC_BASE: ListControlsSpec = {
  sortOptions: [
    { key: "date_desc", label: "" },
    { key: "date_asc", label: "" },
    { key: "hardest", label: "" },
    { key: "easiest", label: "" },
    { key: "sets_desc", label: "" },
  ],
  defaultSort: "date_desc",
  filterGroups: [
    {
      param: "video",
      label: "",
      options: [
        { value: "all", label: "" },
        { value: "with", label: "" },
        { value: "without", label: "" },
      ],
      defaultValue: "all",
    },
  ],
  searchable: true,
};

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);
  const controls = parseListControls(url.searchParams, SPEC_BASE);

  const video = (controls.filters.video ?? "all") as "all" | "with" | "without";
  const total = await countLogsForTrainee(db, user.id, { q: controls.q, video });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;

  const logs = await listLogsForTrainee(db, user.id, {
    limit: PAGE_SIZE,
    offset,
    sort: controls.sort as LogSort,
    q: controls.q,
    video,
  });
  return { logs, controls, page: safePage, totalPages, total };
}

export default function TraineeHistoryList() {
  const { logs, controls, page, totalPages, total } = useLoaderData<typeof loader>();
  const { t } = useTranslation("podopieczny");

  /** Spec with translated labels — built at render time. */
  const spec: ListControlsSpec = {
    ...SPEC_BASE,
    sortOptions: [
      { key: "date_desc", label: t("historia.list.sortOptions.date_desc") },
      { key: "date_asc", label: t("historia.list.sortOptions.date_asc") },
      { key: "hardest", label: t("historia.list.sortOptions.hardest") },
      { key: "easiest", label: t("historia.list.sortOptions.easiest") },
      { key: "sets_desc", label: t("historia.list.sortOptions.sets_desc") },
    ],
    filterGroups: [
      {
        param: "video",
        label: t("historia.list.filterVideo.label"),
        options: [
          { value: "all", label: t("historia.list.filterVideo.all") },
          { value: "with", label: t("historia.list.filterVideo.with") },
          { value: "without", label: t("historia.list.filterVideo.without") },
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
            {t("historia.list.eyebrow")}
          </div>
          <h1>{t("historia.list.title")}</h1>
          <div className="sub">
            {total === 0 ? t("historia.list.empty") : t("historia.list.total", { count: total })}
          </div>
        </div>
      </div>

      <ListControls
        spec={spec}
        state={controls}
        searchPlaceholder={t("historia.list.searchPlaceholder")}
      />

      {total === 0 ? (
        <div className="empty">
          <h3>{t("historia.list.emptyState.title")}</h3>
          <div>{t("historia.list.emptyState.subtitle")}</div>
        </div>
      ) : (
        <div className="list">
          {logs.map((log) => (
            <Link
              key={log.id}
              to={`/podopieczny/historia/${log.id}`}
              className="list-row"
              style={{ gridTemplateColumns: "76px 1fr auto", gap: 14 }}
            >
              <div className="mono text-xs muted">{fmtDate(log.performedOn)}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{log.sessionName}</div>
                <div className="text-xs muted" style={{ marginTop: 2 }}>
                  <span className="mono">{log.exerciseCount}</span>{" "}
                  {t("historia.list.row.exercises", { count: log.exerciseCount })} ·{" "}
                  <span className="mono">{log.setCount}</span>{" "}
                  {t("historia.list.row.sets", { count: log.setCount })} ·{" "}
                  {t("historia.list.row.avg")}{" "}
                  {log.avgDifficulty == null ? (
                    "—"
                  ) : (
                    <>
                      <span className="mono">{log.avgDifficulty}</span>/10
                    </>
                  )}
                  {log.hasVideo && ` · ${t("historia.list.row.video")}`}
                </div>
              </div>
              <Icons.Chev style={{ color: "var(--muted-2)" }} />
            </Link>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        totalLabel={pluralizePl(total, SESJA)}
      />
    </div>
  );
}
