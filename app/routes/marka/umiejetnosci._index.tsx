import { useTranslation } from "react-i18next";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { SkillTreeView } from "~/components/skill-tree";
import { requireUser } from "~/lib/auth";
import { getBrandSkillTree, listBrandSkills } from "~/lib/brand-catalog";
import { db } from "~/lib/db/client";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const [skills, tree] = await Promise.all([
    listBrandSkills(db, orgId),
    getBrandSkillTree(db, orgId),
  ]);
  return { skills, tree };
}

export default function MarkaUmiejetnosciIndex() {
  const { skills, tree } = useLoaderData<typeof loader>();
  const { t } = useTranslation("marka");
  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("umiejetnosci.eyebrow")}
          </div>
          <h1>{t("umiejetnosci.title")}</h1>
        </div>
        <Link to="/marka/umiejetnosci/nowa" className="btn btn-primary">
          <Icons.Plus /> {t("umiejetnosci.new")}
        </Link>
      </div>

      {tree.nodes.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, marginBottom: 16 }}>{t("umiejetnosci.treeTitle")}</h2>
          <SkillTreeView
            tree={tree}
            hrefForNode={(id) => `/marka/umiejetnosci/${id}`}
            showStates={false}
          />
        </div>
      )}

      {skills.length === 0 ? (
        <div className="empty">
          <p>{t("umiejetnosci.empty")}</p>
        </div>
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}
        >
          {skills.map((s) => (
            <Link
              key={s.id}
              to={`/marka/umiejetnosci/${s.id}`}
              className="card card-hover"
              style={{ padding: 14 }}
            >
              <h3 style={{ margin: 0 }}>{s.name}</h3>
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
