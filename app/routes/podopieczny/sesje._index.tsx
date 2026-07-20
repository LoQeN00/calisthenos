import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";
import { Icons } from "~/components/icons";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { daysAgo, fmtDate } from "~/lib/format";
import { loadActivePlanFullForTrainee, type PlanSessionView } from "~/lib/workouts";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const planFull = await loadActivePlanFullForTrainee(db, user.id);
  return { planFull };
}

export default function TraineeSessionsList() {
  const { planFull } = useLoaderData<typeof loader>();
  const { t } = useTranslation("podopieczny");

  if (planFull == null) {
    return (
      <div>
        <div className="pagehead">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {t("sesje.noPlan.eyebrow")}
            </div>
            <h1>{t("sesje.noPlan.title")}</h1>
            <div className="sub">{t("sesje.noPlan.subtitle")}</div>
          </div>
        </div>
        <div className="empty">
          <h3>{t("sesje.noPlan.empty.title")}</h3>
          <div>{t("sesje.noPlan.empty.subtitle")}</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("sesje.eyebrow", { version: planFull.plan.version })}
            {planFull.plan.publishedAt && (
              <>
                {" "}
                · {t("sesje.sinceDate", { date: fmtDate(planFull.plan.publishedAt.toString()) })}
              </>
            )}
          </div>
          <h1>{planFull.plan.name}</h1>
          <div className="sub">{t("sesje.sessionCount", { count: planFull.sessions.length })}</div>
        </div>
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}
      >
        {planFull.sessions.map((s) => (
          <SessionCard key={s.session.id} sessionView={s} />
        ))}
      </div>
    </div>
  );
}

function SessionCard({ sessionView }: { sessionView: PlanSessionView }) {
  const { t, i18n } = useTranslation("podopieczny");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const blocks = sessionView.blocks;
  const totalExercises = blocks.reduce((a, b) => a + b.items.length, 0);
  const supersetCount = blocks.filter((b) => b.block.kind === "superset").length;
  const dropsetCount = blocks.filter((b) => b.block.kind === "dropset").length;

  return (
    <div className="card card-hover" style={{ padding: 18, position: "relative" }}>
      <Link
        to={`/podopieczny/sesje/${sessionView.session.id}`}
        aria-label={t("sesje.card.openAriaLabel", { name: sessionView.session.name })}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          borderRadius: "inherit",
        }}
      />
      <div
        className="row between"
        style={{ marginBottom: 12, alignItems: "flex-start", position: "relative", zIndex: 0 }}
      >
        <div>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>{sessionView.session.name}</h3>
          <div className="text-xs muted">
            <span className="mono">{totalExercises}</span>{" "}
            {t("sesje.card.exerciseCount", { count: totalExercises })}
            {supersetCount > 0 && (
              <>
                {" "}
                · <span className="mono">{supersetCount}</span>{" "}
                {t("sesje.card.supersetCount", { count: supersetCount })}
              </>
            )}
            {dropsetCount > 0 && (
              <>
                {" "}
                · <span className="mono">{dropsetCount}</span>{" "}
                {t("sesje.card.dropsetCount", { count: dropsetCount })}
              </>
            )}
          </div>
        </div>
        {sessionView.doneCount > 0 ? (
          <span className="badge active">
            <span className="badge-dot" />
            <span className="mono">×{sessionView.doneCount}</span>
          </span>
        ) : (
          <span className="badge">
            <span className="badge-dot" />
            {t("sesje.card.badgeNew")}
          </span>
        )}
      </div>

      <div className="col" style={{ gap: 6, position: "relative", zIndex: 0 }}>
        {blocks.slice(0, 4).map((b, bi) => {
          const first = b.items[0];
          const refs = b.items;
          return (
            <div key={b.block.id} className="row" style={{ gap: 8, fontSize: 13 }}>
              <span className="mono muted" style={{ fontSize: 11, width: 22, textAlign: "center" }}>
                {String.fromCharCode(65 + bi)}
              </span>
              {b.block.kind === "superset" && (
                <Icons.Link style={{ color: "var(--muted)", fontSize: 13 }} />
              )}
              {b.block.kind === "dropset" && (
                <Icons.Drop
                  style={{
                    color: "var(--accent-ink)",
                    background: "var(--accent)",
                    padding: 2,
                    borderRadius: 3,
                    fontSize: 11,
                  }}
                />
              )}
              <span style={{ flex: 1, color: "var(--ink-2)" }}>
                {refs.map((r) => r.exercise.name).join(b.block.kind === "dropset" ? " → " : " + ")}
              </span>
              <span className="mono muted" style={{ fontSize: 11 }}>
                {b.block.kind === "dropset"
                  ? `${b.block.sets ?? 0}×${b.items.length}drop`
                  : `${first?.item.sets ?? 0}×${first?.item.reps ?? 0}${
                      first?.exercise.unit === "SEC" ? "s" : ""
                    }`}
              </span>
            </div>
          );
        })}
        {blocks.length > 4 && (
          <div className="text-xs muted" style={{ marginTop: 4 }}>
            {t("sesje.card.moreBlocks", { count: blocks.length - 4 })}
          </div>
        )}
      </div>

      <div
        className="row between"
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px dashed var(--line)",
          alignItems: "center",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div className="text-xs muted">
          {sessionView.lastPerformedOn ? (
            <>{t("sesje.card.lastPerformed", { when: daysAgo(sessionView.lastPerformedOn, locale) })}</>
          ) : (
            <>{t("sesje.card.neverDone")}</>
          )}
        </div>
        <Link
          to={`/podopieczny/loguj/${sessionView.session.id}`}
          className="btn btn-primary btn-sm"
        >
          <Icons.Plus /> {t("sesje.card.registerBtn")}
        </Link>
      </div>
    </div>
  );
}
