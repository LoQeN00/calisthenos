import { useTranslation } from "react-i18next";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { listSkillsForTrainer } from "~/lib/skills";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const skills = await listSkillsForTrainer(db, {
    trainerId: user.id,
    organizationId: user.organizationId,
  });
  return { skills };
}

export default function UmiejetnosciList() {
  const { skills } = useLoaderData<typeof loader>();
  const { t } = useTranslation("trenerPlany");
  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("umiejetnosci.eyebrow")}
          </div>
          <h1>{t("umiejetnosci.title")}</h1>
          <div className="sub">
            {skills.length === 0
              ? t("umiejetnosci.subEmpty")
              : t("umiejetnosci.subCount", { count: skills.length })}
          </div>
        </div>
        <Link to="/trener/umiejetnosci/nowa" className="btn btn-primary">
          <Icons.Plus /> {t("umiejetnosci.newSkill")}
        </Link>
      </div>

      {skills.length === 0 ? (
        <div className="empty">
          <h3>{t("umiejetnosci.emptyTitle")}</h3>
          <div>{t("umiejetnosci.emptyBody")}</div>
        </div>
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}
        >
          {skills.map((s) => (
            <Link
              key={s.id}
              to={`/trener/umiejetnosci/${s.id}`}
              className="card card-hover"
              style={{ padding: 14 }}
            >
              <div className="row between" style={{ alignItems: "flex-start", gap: 8 }}>
                <h3 style={{ margin: 0 }}>{s.name}</h3>
                {s.isBrand && (
                  <span className="badge" style={{ flexShrink: 0 }}>
                    {t("umiejetnosci.brandBadge")}
                  </span>
                )}
              </div>
              <div className="text-xs muted" style={{ marginTop: 8 }}>
                {t("umiejetnosci.variationsCount", { count: s.variationCount })}
              </div>
              {s.description && (
                <div className="text-sm muted" style={{ marginTop: 8, lineHeight: 1.4 }}>
                  {s.description}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
