import { and, count, eq } from "drizzle-orm";
import {
  NavLink,
  Outlet,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router";
import { Icons } from "~/components/icons";
import { UserMenu } from "~/components/user-menu";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });

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
    .where(
      and(eq(schema.plans.traineeId, user.id), eq(schema.plans.status, "active")),
    )
    .limit(1);
  let sessionsCount = 0;
  if (activePlan[0]) {
    const [row] = await db
      .select({ c: count() })
      .from(schema.planSessions)
      .where(eq(schema.planSessions.planId, activePlan[0].id));
    sessionsCount = Number(row?.c ?? 0);
  }

  return {
    user,
    tails: {
      sessions: sessionsCount,
      history: Number(logCountRow?.c ?? 0),
      photos: Number(photoCountRow?.c ?? 0),
    },
  };
}

const NAV_ITEMS = [
  { to: "/podopieczny", label: "Mój plan", end: true, icon: "Dashboard" as const, tailKey: null },
  { to: "/podopieczny/sesje", label: "Sesje", end: false, icon: "Plans" as const, tailKey: "sessions" as const },
  { to: "/podopieczny/historia", label: "Historia", end: false, icon: "History" as const, tailKey: "history" as const },
  { to: "/podopieczny/statystyki", label: "Statystyki", end: false, icon: "Chart" as const, tailKey: null },
  { to: "/podopieczny/sylwetka", label: "Sylwetka", end: false, icon: "Camera" as const, tailKey: "photos" as const },
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

