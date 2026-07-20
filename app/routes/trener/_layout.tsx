import { and, count, eq, isNull } from "drizzle-orm";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { UserMenu } from "~/components/user-menu";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });

  const [traineeCountRow] = await db
    .select({ c: count() })
    .from(schema.users)
    .where(and(eq(schema.users.trainerId, user.id), eq(schema.users.role, "trainee")));
  const [exerciseCountRow] = await db
    .select({ c: count() })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.trainerId, user.id), isNull(schema.exercises.archivedAt)));
  const [planCountRow] = await db
    .select({ c: count() })
    .from(schema.plans)
    .where(eq(schema.plans.trainerId, user.id));

  return {
    user,
    tails: {
      trainees: Number(traineeCountRow?.c ?? 0),
      exercises: Number(exerciseCountRow?.c ?? 0),
      plans: Number(planCountRow?.c ?? 0),
    },
  };
}

const NAV_ITEMS = [
  {
    to: "/trener",
    labelKey: "nav.trener.dashboard" as const,
    end: true,
    icon: "Dashboard" as const,
    tailKey: null,
  },
  {
    to: "/trener/podopieczni",
    labelKey: "nav.trener.trainees" as const,
    end: false,
    icon: "Users" as const,
    tailKey: "trainees" as const,
  },
  {
    to: "/trener/biblioteka",
    labelKey: "nav.trener.library" as const,
    end: false,
    icon: "Library" as const,
    tailKey: "exercises" as const,
  },
  {
    to: "/trener/plany",
    labelKey: "nav.trener.plans" as const,
    end: false,
    icon: "Plans" as const,
    tailKey: "plans" as const,
  },
  {
    to: "/trener/umiejetnosci",
    labelKey: "nav.trener.skills" as const,
    end: false,
    icon: "Trend" as const,
    tailKey: null,
  },
  {
    to: "/trener/konsultacje",
    labelKey: "nav.trener.consultations" as const,
    end: false,
    icon: "Consult" as const,
    tailKey: null,
  },
  {
    to: "/trener/integracje/stripe",
    labelKey: "nav.trener.payments" as const,
    end: false,
    icon: "Card" as const,
    tailKey: null,
  },
  {
    to: "/trener/integracje/google",
    labelKey: "nav.trener.integrations" as const,
    end: false,
    icon: "Link" as const,
    tailKey: null,
  },
];

export default function TrenerLayout() {
  const { user, tails } = useLoaderData<typeof loader>();
  const { t } = useTranslation("common");

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <span>calisthenos</span>
          <span className="brand-dot" />
        </div>
        <span className="topbar-eyebrow">{t("nav.trener.eyebrow")}</span>
        <div className="topbar-spacer" />
        <UserMenu displayName={user.displayName} />
      </header>
      <div className="layout">
        <nav className="sidenav">
          <div className="sidenav-section">{t("nav.trener.section")}</div>
          {NAV_ITEMS.map((item) => {
            const Icon = Icons[item.icon];
            const tail = item.tailKey ? tails[item.tailKey] : null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
              >
                <Icon />
                <span>{t(item.labelKey)}</span>
                {tail != null && <span className="nav-tail">{tail}</span>}
              </NavLink>
            );
          })}
        </nav>
        <main className="main view-fade">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
