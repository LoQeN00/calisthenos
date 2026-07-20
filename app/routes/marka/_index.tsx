import { and, count, eq, isNull } from "drizzle-orm";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) return { exercises: 0, skills: 0 };
  // Liczymy AKTYWNE markowe pozycje przez count() — te same liczby co odznaki w
  // nawigacji (`_layout.tsx`), więc karty KPI i tail-e się zgadzają.
  const [ex] = await db
    .select({ c: count() })
    .from(schema.exercises)
    .where(
      and(
        isNull(schema.exercises.trainerId),
        eq(schema.exercises.organizationId, orgId),
        isNull(schema.exercises.archivedAt),
      ),
    );
  const [sk] = await db
    .select({ c: count() })
    .from(schema.skills)
    .where(
      and(
        isNull(schema.skills.trainerId),
        eq(schema.skills.organizationId, orgId),
        isNull(schema.skills.archivedAt),
      ),
    );
  return { exercises: Number(ex?.c ?? 0), skills: Number(sk?.c ?? 0) };
}

export default function MarkaIndex() {
  const { exercises, skills } = useLoaderData<typeof loader>();
  const { t } = useTranslation("marka");

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow">{t("pulpit.eyebrow")}</div>
          <h1>{t("pulpit.title")}</h1>
        </div>
      </div>

      <div
        className="card"
        style={{
          display: "flex",
          gap: 28,
          padding: "16px 20px",
          marginBottom: 22,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Link to="/marka/biblioteka" className="stat" style={{ textDecoration: "none" }}>
          <div className="v">{exercises}</div>
          <div className="k">{t("pulpit.exercisesCard")}</div>
        </Link>
        <span className="vdiv" style={{ height: 36 }} />
        <Link to="/marka/umiejetnosci" className="stat" style={{ textDecoration: "none" }}>
          <div className="v">{skills}</div>
          <div className="k">{t("pulpit.skillsCard")}</div>
        </Link>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link to="/marka/biblioteka" className="btn btn-primary">
          {t("pulpit.manageExercises")}
        </Link>
        <Link to="/marka/umiejetnosci" className="btn btn-ghost">
          {t("pulpit.manageSkills")}
        </Link>
      </div>
    </div>
  );
}
