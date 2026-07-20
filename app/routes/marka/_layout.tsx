import { and, count, eq, isNull } from "drizzle-orm";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { UserMenu } from "~/components/user-menu";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

// Pozycje nawigacji jeszcze nieaktywne (kolejne plasterki epiku „Platforma marki").
// Brak tokena `.nav-item.disabled` w tokens.css → semantyka przez aria-disabled + styl.
const DISABLED_ITEM_STYLE = { opacity: 0.5, cursor: "default" } as const;
const SOON_TAIL_STYLE = { fontSize: "0.65rem", opacity: 0.8 } as const;

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  let exercises = 0;
  let skills = 0;
  if (orgId) {
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
    exercises = Number(ex?.c ?? 0);
    skills = Number(sk?.c ?? 0);
  }
  return { user, tails: { exercises, skills } };
}

export default function MarkaLayout() {
  const { user, tails } = useLoaderData<typeof loader>();
  const { t } = useTranslation("marka");
  const { t: tc } = useTranslation("common");

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <span>kalisthenos</span>
          <span className="brand-dot" />
        </div>
        <span className="topbar-eyebrow">{tc("nav.marka.eyebrow")}</span>
        <div className="topbar-spacer" />
        <UserMenu displayName={user.displayName} />
      </header>
      <div className="layout">
        <nav className="sidenav">
          <div className="sidenav-section">{t("nav.section")}</div>

          {/* Pulpit */}
          <NavLink
            to="/marka"
            end
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <Icons.Dashboard />
            <span>{t("nav.dashboard")}</span>
          </NavLink>

          {/* Biblioteka ćwiczeń */}
          <NavLink
            to="/marka/biblioteka"
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <Icons.Library />
            <span>{t("nav.library")}</span>
            <span className="nav-tail">{tails.exercises}</span>
          </NavLink>

          {/* Umiejętności */}
          <NavLink
            to="/marka/umiejetnosci"
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <Icons.Trend />
            <span>{t("nav.skills")}</span>
            <span className="nav-tail">{tails.skills}</span>
          </NavLink>

          {/* Ambasadorzy */}
          <NavLink
            to="/marka/ambasadorzy"
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <Icons.Users />
            <span>{t("nav.ambassadors")}</span>
          </NavLink>

          {/* Regiony — wkrótce */}
          <span className="nav-item" aria-disabled="true" style={DISABLED_ITEM_STYLE}>
            <Icons.Calendar />
            <span>{t("nav.regions")}</span>
            <span className="nav-tail" style={SOON_TAIL_STYLE}>
              {t("nav.soon")}
            </span>
          </span>

          {/* Ustawienia marki — wkrótce */}
          <span className="nav-item" aria-disabled="true" style={DISABLED_ITEM_STYLE}>
            <Icons.Settings />
            <span>{t("nav.settings")}</span>
            <span className="nav-tail" style={SOON_TAIL_STYLE}>
              {t("nav.soon")}
            </span>
          </span>
        </nav>
        <main className="main view-fade">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
