import { and, count, eq } from "drizzle-orm";
import { NavLink, Outlet, redirect, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { UserMenu } from "~/components/user-menu";
import { requireUser } from "~/lib/auth";
import { countPendingForTrainee } from "~/lib/consultations";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { countForTrainee } from "~/lib/feature-requests";
import { hasPendingOnboarding } from "~/lib/onboarding-forms";
import { hasTraineeAppAccess } from "~/lib/stripe/gate";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });

  // Bramki idą PRZED licznikami — podopieczny, którego i tak odsyłamy, nie ma po
  // co kosztować sześciu zapytań. Kolejność: najpierw płatność (drzwi do
  // aplikacji), potem formularz startowy (już wnętrze relacji).
  const { hasAccess, sub } = await hasTraineeAppAccess(db, user);
  if (!hasAccess) throw redirect("/podopieczny/aktywuj");
  if (await hasPendingOnboarding(db, user.id)) throw redirect("/podopieczny/formularz");

  const [logCountRow] = await db
    .select({ c: count() })
    .from(schema.workoutLogs)
    .where(eq(schema.workoutLogs.traineeId, user.id));
  const [photoCountRow] = await db
    .select({ c: count() })
    .from(schema.bodyPhotos)
    .where(eq(schema.bodyPhotos.traineeId, user.id));

  // Sessions count = sessions in the trainee's active plan (if any).
  const activePlan = await db
    .select({ id: schema.plans.id })
    .from(schema.plans)
    .where(and(eq(schema.plans.traineeId, user.id), eq(schema.plans.status, "active")))
    .limit(1);
  let sessionsCount = 0;
  if (activePlan[0]) {
    const [row] = await db
      .select({ c: count() })
      .from(schema.planSessions)
      .where(eq(schema.planSessions.planId, activePlan[0].id));
    sessionsCount = Number(row?.c ?? 0);
  }

  const pending = await countPendingForTrainee(db, user.id);
  const ideas = await countForTrainee(db, user.id);

  // Odznaka: subskrypcja wymaga uwagi (past_due, unpaid albo brak wiersza, gdy
  // trener ustawił już cenę). `sub` jest null, gdy trenera nie ma — wtedy 0.
  const needsAttention =
    sub?.status === "past_due" ||
    sub?.status === "unpaid" ||
    (sub?.status === "none" && sub.stripePriceId != null);

  return {
    user,
    tails: {
      sessions: sessionsCount,
      history: Number(logCountRow?.c ?? 0),
      photos: Number(photoCountRow?.c ?? 0),
      consultations: pending,
      ideas,
      payments: needsAttention ? 1 : 0,
    },
  };
}

const NAV_ITEMS = [
  { to: "/podopieczny", label: "Mój plan", end: true, icon: "Dashboard" as const, tailKey: null },
  {
    to: "/podopieczny/sesje",
    label: "Sesje",
    end: false,
    icon: "Plans" as const,
    tailKey: "sessions" as const,
  },
  {
    to: "/podopieczny/historia",
    label: "Historia",
    end: false,
    icon: "History" as const,
    tailKey: "history" as const,
  },
  {
    to: "/podopieczny/rozwoj",
    label: "Rozwój",
    end: false,
    icon: "Trend" as const,
    tailKey: null,
  },
  {
    to: "/podopieczny/sylwetka",
    label: "Sylwetka",
    end: false,
    icon: "Camera" as const,
    tailKey: "photos" as const,
  },
  {
    to: "/podopieczny/konsultacje",
    label: "Konsultacje",
    end: false,
    icon: "Consult" as const,
    tailKey: "consultations" as const,
  },
  {
    to: "/podopieczny/pomysly",
    label: "Pomysły",
    end: false,
    icon: "Sparkle" as const,
    tailKey: "ideas" as const,
  },
  {
    to: "/podopieczny/platnosci",
    label: "Płatności",
    end: false,
    icon: "Card" as const,
    tailKey: "payments" as const,
  },
];

export default function PodopiecznyLayout() {
  const { user, tails } = useLoaderData<typeof loader>();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <span>calisthenos</span>
          <span className="brand-dot" />
        </div>
        <span className="topbar-eyebrow">PODOPIECZNY</span>
        <div className="topbar-spacer" />
        <UserMenu displayName={user.displayName} />
      </header>
      <div className="layout">
        <nav className="sidenav nav-tabs-bottom">
          <div className="sidenav-section">Podopieczny</div>
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
                <span>{item.label}</span>
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
